import { encryptCredentials } from '@lightboard/db/crypto';
import { organizations } from '@lightboard/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getAdminDb, withAuth } from '@/lib/auth';

/**
 * GET /api/settings/ai — Returns the org's AI model configuration.
 * Never returns the actual API key — only a boolean `hasApiKey`.
 */
export const GET = withAuth(async (_req, { orgId }) => {
  const adminDb = getAdminDb();
  const [org] = await adminDb
    .select({ settings: organizations.settings, aiCredentials: organizations.aiCredentials })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const settings = org.settings as Record<string, unknown> | null;
  const aiConfig = (settings?.ai as Record<string, unknown>) ?? {};

  return NextResponse.json({
    providerType: aiConfig.providerType ?? null,
    baseUrl: aiConfig.baseUrl ?? null,
    model: aiConfig.model ?? null,
    hasApiKey: !!org.aiCredentials,
  });
});

/**
 * PUT /api/settings/ai — Save AI model configuration.
 * Encrypts the API key with per-org key derivation before storing.
 * If apiKey is "********", skips key update (only updates non-sensitive fields).
 */
export const PUT = withAuth(async (req, { orgId }) => {
  const body = await req.json();
  const { providerType, apiKey, baseUrl, model } = body as {
    providerType?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };

  if (!providerType || !['claude', 'openai-compatible'].includes(providerType)) {
    return NextResponse.json(
      { error: 'providerType must be "claude" or "openai-compatible"' },
      { status: 400 },
    );
  }

  if (providerType === 'openai-compatible' && !baseUrl) {
    return NextResponse.json(
      { error: 'baseUrl is required for openai-compatible provider' },
      { status: 400 },
    );
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 });
  }

  const adminDb = getAdminDb();

  // Build the settings.ai object
  const aiSettings: Record<string, unknown> = { providerType };
  if (baseUrl) aiSettings.baseUrl = baseUrl;
  if (model) aiSettings.model = model;

  // Fetch current org to merge settings
  const [org] = await adminDb
    .select({ settings: organizations.settings, aiCredentials: organizations.aiCredentials })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const currentSettings = (org.settings as Record<string, unknown>) ?? {};
  const updatedSettings = { ...currentSettings, ai: aiSettings };

  // Determine whether to update the encrypted API key
  const masked = '********';
  let encryptedKey = org.aiCredentials;

  if (apiKey && apiKey !== masked) {
    encryptedKey = encryptCredentials(masterKey, orgId, apiKey);
  }

  await adminDb
    .update(organizations)
    .set({
      settings: updatedSettings,
      aiCredentials: encryptedKey,
    })
    .where(eq(organizations.id, orgId));

  return NextResponse.json({ saved: true });
});
