import { describe, expect, it } from 'vitest';
import { decryptCredentials, encryptCredentials } from './crypto';

const MASTER_KEY = 'a'.repeat(64);

describe('credential encryption', () => {
  it('round-trips encrypt/decrypt', () => {
    const orgId = '00000000-0000-0000-0000-000000000001';
    const plaintext = JSON.stringify({ host: 'localhost', password: 'secret' });

    const encrypted = encryptCredentials(MASTER_KEY, orgId, plaintext);
    const decrypted = decryptCredentials(MASTER_KEY, orgId, encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for different orgs', () => {
    const orgA = '00000000-0000-0000-0000-000000000001';
    const orgB = '00000000-0000-0000-0000-000000000002';
    const plaintext = 'same-data';

    const encA = encryptCredentials(MASTER_KEY, orgA, plaintext);
    const encB = encryptCredentials(MASTER_KEY, orgB, plaintext);

    expect(encA).not.toBe(encB);
  });

  it('fails to decrypt with wrong org id', () => {
    const orgA = '00000000-0000-0000-0000-000000000001';
    const orgB = '00000000-0000-0000-0000-000000000002';
    const encrypted = encryptCredentials(MASTER_KEY, orgA, 'secret');

    expect(() => decryptCredentials(MASTER_KEY, orgB, encrypted)).toThrow();
  });

  it('fails on tampered ciphertext', () => {
    const orgId = '00000000-0000-0000-0000-000000000001';
    const encrypted = encryptCredentials(MASTER_KEY, orgId, 'secret');
    const parts = encrypted.split(':');
    // Flip bits in the auth tag to trigger GCM authentication failure
    const tagBuf = Buffer.from(parts[2]!, 'base64');
    tagBuf[0] = (tagBuf[0] ?? 0) ^ 0xff;
    const tampered = `${parts[0]}:${parts[1]}:${tagBuf.toString('base64')}`;

    expect(() => decryptCredentials(MASTER_KEY, orgId, tampered)).toThrow();
  });

  it('fails on invalid format', () => {
    const orgId = '00000000-0000-0000-0000-000000000001';
    expect(() => decryptCredentials(MASTER_KEY, orgId, 'not-valid')).toThrow();
  });
});
