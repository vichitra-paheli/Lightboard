import { encryptCredentials } from '@lightboard/db/crypto';
import { agentRoleAssignments, modelConfigs } from '@lightboard/db/schema';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';

/** Mask the API-key value sends back to the UI when it's asked to keep the stored key. */
const API_KEY_MASK = '********';

/** Providers the server accepts (mirrored in {@link VALID_PROVIDERS} of the list route). */
const VALID_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'azure',
  'bedrock',
  'google',
  'local',
]);

/** Shape of an update payload. Every field is optional. */
interface UpdateBody {
  name?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
}

/** GET /api/settings/ai/configs/[id] — fetch a single config (no key). */
export const GET = withAuth(async (req, { db, orgId }) => {
  const url = new URL(req.url);
  const id = url.pathname.split('/').at(-1);
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const [row] = await db
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
    .where(and(eq(modelConfigs.orgId, orgId), eq(modelConfigs.id, id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    config: {
      ...row,
      temperature: row.temperature === null ? null : Number(row.temperature),
      hasApiKey: true,
    },
  });
});

/**
 * PUT /api/settings/ai/configs/[id] — update a config.
 *
 * Pass `apiKey: "********"` (or omit it) to keep the stored encrypted value;
 * pass a new string to rotate. Any other field may be updated independently.
 */
export const PUT = withAuth(async (req, { db, orgId }) => {
  const url = new URL(req.url);
  const id = url.pathname.split('/').at(-1);
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, provider, model, apiKey, baseUrl, temperature, maxTokens } = body;
  if (provider && !VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: `Unknown provider "${provider}"` }, { status: 400 });
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (provider !== undefined) updates.provider = provider;
  if (model !== undefined) updates.model = model;
  if (baseUrl !== undefined) updates.baseUrl = baseUrl;
  if (temperature !== undefined) {
    updates.temperature = temperature === null ? null : String(temperature);
  }
  if (maxTokens !== undefined) updates.maxTokens = maxTokens;
  if (apiKey !== undefined && apiKey !== API_KEY_MASK && apiKey.length > 0) {
    updates.encryptedApiKey = encryptCredentials(masterKey, orgId, apiKey);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(modelConfigs)
    .set(updates)
    .where(and(eq(modelConfigs.orgId, orgId), eq(modelConfigs.id, id)))
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

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    config: {
      ...updated,
      temperature: updated.temperature === null ? null : Number(updated.temperature),
      hasApiKey: true,
    },
  });
});

/**
 * DELETE /api/settings/ai/configs/[id] — remove a config.
 *
 * Returns 409 if any role still routes to this config — the UI prompts the
 * user to reassign first. Cascade happens via the `ON DELETE RESTRICT`
 * foreign key on {@link agentRoleAssignments.modelConfigId}.
 */
export const DELETE = withAuth(async (req, { db, orgId }) => {
  const url = new URL(req.url);
  const id = url.pathname.split('/').at(-1);
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const referencingRoles = await db
    .select({ role: agentRoleAssignments.role })
    .from(agentRoleAssignments)
    .where(and(eq(agentRoleAssignments.orgId, orgId), eq(agentRoleAssignments.modelConfigId, id)));

  if (referencingRoles.length > 0) {
    return NextResponse.json(
      {
        error: 'Config is still routed to one or more agent roles. Reassign them first.',
        roles: referencingRoles.map((r) => r.role),
      },
      { status: 409 },
    );
  }

  const result = await db
    .delete(modelConfigs)
    .where(and(eq(modelConfigs.orgId, orgId), eq(modelConfigs.id, id)))
    .returning({ id: modelConfigs.id });

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
});
