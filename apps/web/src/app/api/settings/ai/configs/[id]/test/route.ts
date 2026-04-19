import { decryptCredentials } from '@lightboard/db/crypto';
import { modelConfigs } from '@lightboard/db/schema';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import {
  ClaudeProvider,
  LLMError,
  type LLMProvider,
  OpenAICompatibleProvider,
} from '@lightboard/agent';

/**
 * POST /api/settings/ai/configs/[id]/test — provider ping.
 *
 * Instantiates the real provider with the stored (decrypted) key and issues
 * a 1-token prompt. Returns `{ ok, message, latencyMs }` either way — this
 * lets the UI surface a success pill or the actual provider error without
 * writing anything to DB.
 */
export const POST = withAuth(async (req, { db, orgId }) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  // .../configs/[id]/test → pop 'test', the next segment is the id.
  const id = parts.at(-2);
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const [row] = await db
    .select({
      provider: modelConfigs.provider,
      model: modelConfigs.model,
      baseUrl: modelConfigs.baseUrl,
      encryptedApiKey: modelConfigs.encryptedApiKey,
    })
    .from(modelConfigs)
    .where(and(eq(modelConfigs.orgId, orgId), eq(modelConfigs.id, id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 });
  }

  let apiKey: string;
  try {
    apiKey = decryptCredentials(masterKey, orgId, row.encryptedApiKey);
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Stored API key could not be decrypted. Re-enter it and save.' },
      { status: 200 },
    );
  }

  let provider: LLMProvider;
  try {
    switch (row.provider) {
      case 'anthropic':
        provider = new ClaudeProvider({ apiKey, model: row.model, maxTokens: 1 });
        break;
      case 'openai':
        provider = new OpenAICompatibleProvider({
          baseUrl: row.baseUrl ?? 'https://api.openai.com',
          apiKey,
          model: row.model,
          maxTokens: 1,
        });
        break;
      case 'openai-compatible':
      case 'local':
        provider = new OpenAICompatibleProvider({
          baseUrl: row.baseUrl ?? 'http://localhost:11434/v1',
          apiKey,
          model: row.model,
          maxTokens: 1,
        });
        break;
      default:
        return NextResponse.json(
          {
            ok: false,
            message: `Provider "${row.provider}" is UI-only in this release. Ping will be enabled when its implementation lands.`,
          },
          { status: 200 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : 'Provider init failed' },
      { status: 200 },
    );
  }

  const start = performance.now();
  try {
    // Minimal 1-token prompt. We iterate until either a text_delta or
    // message_end arrives — enough to confirm the credential works.
    const stream = provider.chat(
      [{ role: 'user', content: 'ping' }],
      [],
      { maxTokens: 1, system: 'You are a diagnostic probe. Reply with a single character.' },
    );
    let received = false;
    for await (const ev of stream) {
      if (ev.type === 'text_delta' || ev.type === 'message_end') {
        received = true;
        break;
      }
    }
    const latencyMs = Math.round(performance.now() - start);
    return NextResponse.json({
      ok: received,
      message: received ? 'OK' : 'Connected, but provider returned no content.',
      latencyMs,
    });
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message =
      err instanceof LLMError
        ? `${err.provider} error (${err.statusCode ?? 'n/a'}): ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return NextResponse.json({ ok: false, message, latencyMs });
  }
});
