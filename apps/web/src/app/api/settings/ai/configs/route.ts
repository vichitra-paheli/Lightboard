import { encryptCredentials } from '@lightboard/db/crypto';
import { agentRoleAssignments, modelConfigs } from '@lightboard/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import { AGENT_ROLES } from '@/lib/ai-provider';

/**
 * Providers users may pick in the UI. Only the first four have real
 * implementations today — the remaining three surface as selectable tiles but
 * {@link resolveAIProviders} rejects them until provider classes land.
 */
const VALID_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'azure',
  'bedrock',
  'google',
  'local',
]);

/** Safe body type for create/update. */
interface ConfigBody {
  name?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
}

/**
 * GET /api/settings/ai/configs — list all LLM model configurations for the
 * current org. The encrypted API key is never returned; the UI sees only
 * `hasApiKey: true` so it can display a mask.
 */
export const GET = withAuth(async (_req, { db, orgId }) => {
  const rows = await db
    .select({
      id: modelConfigs.id,
      name: modelConfigs.name,
      provider: modelConfigs.provider,
      model: modelConfigs.model,
      baseUrl: modelConfigs.baseUrl,
      temperature: modelConfigs.temperature,
      maxTokens: modelConfigs.maxTokens,
      createdAt: modelConfigs.createdAt,
      updatedAt: modelConfigs.updatedAt,
    })
    .from(modelConfigs)
    .where(eq(modelConfigs.orgId, orgId));

  return NextResponse.json({
    configs: rows.map((r) => ({
      ...r,
      // numeric() comes back as a string; normalize for the client.
      temperature: r.temperature === null ? null : Number(r.temperature),
      hasApiKey: true,
    })),
  });
});

/**
 * POST /api/settings/ai/configs — create a new LLM config.
 *
 * Body: `{ name, provider, model, apiKey, baseUrl?, temperature?, maxTokens? }`.
 * Encrypts the API key with the per-org derived key. When this is the first
 * config for the org, auto-inserts the four `agent_role_assignments` rows
 * pointing to it so chat is immediately usable.
 */
export const POST = withAuth(async (req, { db, orgId }) => {
  let body: ConfigBody;
  try {
    body = (await req.json()) as ConfigBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, provider, model, apiKey, baseUrl, temperature, maxTokens } = body;
  if (!name || !provider || !model || !apiKey) {
    return NextResponse.json(
      { error: 'name, provider, model, and apiKey are required' },
      { status: 400 },
    );
  }
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: `Unknown provider "${provider}"` }, { status: 400 });
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 });
  }

  const encrypted = encryptCredentials(masterKey, orgId, apiKey);

  const [created] = await db
    .insert(modelConfigs)
    .values({
      orgId,
      name,
      provider,
      model,
      baseUrl: baseUrl ?? null,
      encryptedApiKey: encrypted,
      temperature: temperature === null || temperature === undefined ? null : String(temperature),
      maxTokens: maxTokens ?? null,
    })
    .returning({
      id: modelConfigs.id,
      name: modelConfigs.name,
      provider: modelConfigs.provider,
      model: modelConfigs.model,
      baseUrl: modelConfigs.baseUrl,
      temperature: modelConfigs.temperature,
      maxTokens: modelConfigs.maxTokens,
      createdAt: modelConfigs.createdAt,
      updatedAt: modelConfigs.updatedAt,
    });

  if (!created) {
    return NextResponse.json({ error: 'Failed to create config' }, { status: 500 });
  }

  // If this is the first config for the org, auto-wire it to all four roles.
  const existingRouting = await db
    .select({ role: agentRoleAssignments.role })
    .from(agentRoleAssignments)
    .where(eq(agentRoleAssignments.orgId, orgId));

  if (existingRouting.length === 0) {
    await db.insert(agentRoleAssignments).values(
      AGENT_ROLES.map((role) => ({ orgId, role, modelConfigId: created.id })),
    );
  }

  return NextResponse.json(
    {
      config: {
        ...created,
        temperature: created.temperature === null ? null : Number(created.temperature),
        hasApiKey: true,
      },
    },
    { status: 201 },
  );
});
