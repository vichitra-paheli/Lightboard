import { decryptCredentials } from '@lightboard/db/crypto';
import {
  ClaudeProvider,
  type LLMProvider,
  OpenAICompatibleProvider,
} from '@lightboard/agent';
import type { Database } from '@lightboard/db';
import { agentRoleAssignments, modelConfigs, organizations } from '@lightboard/db/schema';
import { eq } from 'drizzle-orm';

/** Agent role identifiers understood by the leader + sub-agents. */
export type AgentRole = 'leader' | 'query' | 'view' | 'insights';

/** Ordered list of the four roles — single source of truth for iteration. */
export const AGENT_ROLES: readonly AgentRole[] = ['leader', 'query', 'view', 'insights'] as const;

/** Mapping from each agent role to a concrete provider instance. */
export type ProviderMap = Record<AgentRole, LLMProvider>;

/**
 * Per-role output-token ceiling lifted from `model_configs.max_tokens`. Values
 * default to `undefined` when a role's model config has no configured max; the
 * agent then falls through to the provider's stored default
 * (`DEFAULT_MAX_OUTPUT_TOKENS`). This map is threaded into LeaderAgent so the
 * user-configured value is applied explicitly at the chat() call site.
 */
export type MaxTokensMap = Partial<Record<AgentRole, number>>;

/** Combined resolution result — providers + per-role token ceilings. */
export interface ResolvedAIProviders {
  providers: ProviderMap;
  maxTokens: MaxTokensMap;
}

/** Provider keys that have a real implementation wired up in this release. */
export const IMPLEMENTED_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'local',
]);

/** Provider keys that appear in the UI but throw at resolution time. */
export const PLACEHOLDER_PROVIDERS = new Set(['google', 'azure', 'bedrock']);

/**
 * A single row from `model_configs` joined with its routing role.
 * Exported for tests; consumers should call {@link resolveAIProviders}.
 */
interface ResolvedConfigRow {
  role: AgentRole;
  provider: string;
  model: string;
  baseUrl: string | null;
  encryptedApiKey: string;
  temperature: string | null;
  maxTokens: number | null;
}

/**
 * Instantiate a concrete {@link LLMProvider} from a decrypted config row.
 * Throws for provider keys that don't have an implementation yet — callers
 * surface this as a 503 with a "configure in Settings → LLMs" hint.
 */
function instantiateProvider(row: ResolvedConfigRow, apiKey: string): LLMProvider {
  switch (row.provider) {
    case 'anthropic':
      return new ClaudeProvider({
        apiKey,
        model: row.model,
        maxTokens: row.maxTokens ?? undefined,
      });
    case 'openai':
      return new OpenAICompatibleProvider({
        baseUrl: row.baseUrl ?? 'https://api.openai.com',
        apiKey,
        model: row.model,
        maxTokens: row.maxTokens ?? undefined,
      });
    case 'openai-compatible':
    case 'local':
      return new OpenAICompatibleProvider({
        baseUrl: row.baseUrl ?? 'http://localhost:11434/v1',
        apiKey,
        model: row.model,
        maxTokens: row.maxTokens ?? undefined,
      });
    case 'azure':
    case 'bedrock':
    case 'google':
      throw new Error(
        `Provider "${row.provider}" is selectable in the UI but not yet implemented. Pick Anthropic, OpenAI, OpenAI-compatible, or Local for now.`,
      );
    default:
      throw new Error(`Unknown provider: ${row.provider}`);
  }
}

/**
 * Resolve the full {@link ProviderMap} for an org.
 *
 * 1. If routing rows exist, instantiate the matching provider for each role.
 * 2. If a legacy `organizations.ai_credentials` row exists but no routing
 *    rows (migration not yet run), fall back to that single provider for
 *    all four roles so chat keeps working.
 * 3. If neither is set but `ANTHROPIC_API_KEY` is in the env, fabricate a
 *    single Claude provider and mirror it across all four roles — preserves
 *    dev/airgap bootstrapping.
 * 4. Otherwise return `null` — caller returns 503.
 */
export async function resolveAIProviders(
  db: Database,
  orgId: string,
): Promise<ResolvedAIProviders | null> {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;

  // 1. Routing rows + configs (preferred path).
  const rows = await db
    .select({
      role: agentRoleAssignments.role,
      provider: modelConfigs.provider,
      model: modelConfigs.model,
      baseUrl: modelConfigs.baseUrl,
      encryptedApiKey: modelConfigs.encryptedApiKey,
      temperature: modelConfigs.temperature,
      maxTokens: modelConfigs.maxTokens,
    })
    .from(agentRoleAssignments)
    .innerJoin(modelConfigs, eq(agentRoleAssignments.modelConfigId, modelConfigs.id))
    .where(eq(agentRoleAssignments.orgId, orgId));

  if (rows.length > 0 && masterKey) {
    const partial: Partial<ProviderMap> = {};
    const maxTokensPartial: MaxTokensMap = {};
    for (const row of rows) {
      const role = row.role as AgentRole;
      if (!AGENT_ROLES.includes(role)) continue;
      try {
        const apiKey = decryptCredentials(masterKey, orgId, row.encryptedApiKey);
        partial[role] = instantiateProvider(
          {
            ...row,
            role,
          },
          apiKey,
        );
        if (typeof row.maxTokens === 'number') {
          maxTokensPartial[role] = row.maxTokens;
        }
      } catch {
        // Decryption or instantiation failed — leave this role unmapped
        // so the fallbacks below still get a chance to fill it.
      }
    }

    // If the leader has a concrete provider, fill any unmapped sub-roles
    // from it so partial configurations still work end-to-end.
    if (partial.leader) {
      for (const role of AGENT_ROLES) {
        if (!partial[role]) partial[role] = partial.leader;
        if (maxTokensPartial[role] === undefined && maxTokensPartial.leader !== undefined) {
          maxTokensPartial[role] = maxTokensPartial.leader;
        }
      }
      return { providers: partial as ProviderMap, maxTokens: maxTokensPartial };
    }

    // Missing leader but some other role set — still usable: pick any.
    const anyConcrete = AGENT_ROLES.map((r) => partial[r]).find((p): p is LLMProvider => !!p);
    if (anyConcrete) {
      const anyMaxTokens = AGENT_ROLES.map((r) => maxTokensPartial[r]).find(
        (v): v is number => typeof v === 'number',
      );
      return {
        providers: {
          leader: anyConcrete,
          query: partial.query ?? anyConcrete,
          view: partial.view ?? anyConcrete,
          insights: partial.insights ?? anyConcrete,
        },
        maxTokens: {
          leader: maxTokensPartial.leader ?? anyMaxTokens,
          query: maxTokensPartial.query ?? anyMaxTokens,
          view: maxTokensPartial.view ?? anyMaxTokens,
          insights: maxTokensPartial.insights ?? anyMaxTokens,
        },
      };
    }
  }

  // 2. Legacy single-config fallback — org hasn't been migrated yet.
  const [legacy] = await db
    .select({
      settings: organizations.settings,
      aiCredentials: organizations.aiCredentials,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (legacy?.aiCredentials && masterKey) {
    try {
      const apiKey = decryptCredentials(masterKey, orgId, legacy.aiCredentials);
      const settings = legacy.settings as Record<string, unknown> | null;
      const aiConfig = settings?.ai as
        | { providerType?: string; baseUrl?: string; model?: string }
        | undefined;
      const providerType = aiConfig?.providerType ?? 'claude';
      const single =
        providerType === 'claude'
          ? new ClaudeProvider({ apiKey, model: aiConfig?.model })
          : new OpenAICompatibleProvider({
              baseUrl: aiConfig?.baseUrl ?? 'https://api.openai.com',
              apiKey,
              model: aiConfig?.model ?? 'gpt-4o',
            });
      return {
        providers: { leader: single, query: single, view: single, insights: single },
        maxTokens: {},
      };
    } catch {
      // Fall through to env-var fallback.
    }
  }

  // 3. Environment variable bootstrapping (dev / airgap).
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    const single = new ClaudeProvider({ apiKey: envKey });
    return {
      providers: { leader: single, query: single, view: single, insights: single },
      maxTokens: {},
    };
  }

  return null;
}
