import { decryptCredentials } from '@lightboard/db/crypto';
import { organizations } from '@lightboard/db/schema';
import { eq } from 'drizzle-orm';
import {
  ClaudeProvider,
  type LLMProvider,
  OpenAICompatibleProvider,
} from '@lightboard/agent';
import type { Database } from '@lightboard/db';

/** AI config stored in organizations.settings.ai */
interface AIConfig {
  providerType: 'claude' | 'openai-compatible';
  baseUrl?: string;
  model?: string;
}

/**
 * Resolves the AI provider for an organization.
 *
 * 1. If the org has AI config + encrypted credentials in the DB → use those
 * 2. Fallback: if ANTHROPIC_API_KEY env var exists → use ClaudeProvider
 * 3. Neither → return null (caller should return 503)
 */
export async function resolveAIProvider(
  db: Database,
  orgId: string,
): Promise<LLMProvider | null> {
  // Query org settings and AI credentials
  const [org] = await db
    .select({ settings: organizations.settings, aiCredentials: organizations.aiCredentials })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (org?.aiCredentials) {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) return null;

    try {
      const apiKey = decryptCredentials(masterKey, orgId, org.aiCredentials);
      const settings = org.settings as Record<string, unknown> | null;
      const aiConfig = settings?.ai as AIConfig | undefined;
      const providerType = aiConfig?.providerType ?? 'openai-compatible';

      if (providerType === 'claude') {
        return new ClaudeProvider({
          apiKey,
          model: aiConfig?.model,
        });
      }

      // Default: openai-compatible
      return new OpenAICompatibleProvider({
        baseUrl: aiConfig?.baseUrl ?? 'https://api.openai.com',
        apiKey,
        model: aiConfig?.model ?? 'gpt-4o',
      });
    } catch {
      // Decryption failed — fall through to env var fallback
    }
  }

  // Fallback: environment variable
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return new ClaudeProvider({ apiKey: envKey });
  }

  return null;
}
