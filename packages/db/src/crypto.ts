import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HKDF_INFO = 'lightboard-credentials';

/**
 * Derives a per-org encryption key from the master key using HKDF.
 * Each org gets a unique key so compromising one org's data doesn't expose others.
 */
function deriveKey(masterKey: string, orgId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, orgId, HKDF_INFO, KEY_LENGTH));
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a per-org derived key.
 * Returns a base64-encoded string in the format: `iv:ciphertext:authTag`.
 */
export function encryptCredentials(
  masterKey: string,
  orgId: string,
  plaintext: string,
): string {
  const key = deriveKey(masterKey, orgId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), encrypted.toString('base64'), authTag.toString('base64')].join(
    ':',
  );
}

/**
 * Decrypts an encrypted credentials string using AES-256-GCM with a per-org derived key.
 * Expects the format produced by `encryptCredentials`: `iv:ciphertext:authTag`.
 */
export function decryptCredentials(
  masterKey: string,
  orgId: string,
  encrypted: string,
): string {
  const [ivB64, ciphertextB64, authTagB64] = encrypted.split(':');
  if (!ivB64 || !ciphertextB64 || !authTagB64) {
    throw new Error('Invalid encrypted credentials format');
  }

  const key = deriveKey(masterKey, orgId);
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
