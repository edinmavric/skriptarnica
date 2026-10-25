import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decrypt, encrypt, keyVersionOf, parseKeyRing, rotate } from '@/server/crypto/encryption';

const k1 = randomBytes(32).toString('base64');
const k2 = randomBytes(32).toString('base64');

describe('AES-256-GCM with key versions', () => {
  it('round-trips and never repeats ciphertext for the same input', () => {
    const ring = parseKeyRing(`v1:${k1}`, 'v1');
    const a = encrypt('160-0000000012345-67', ring, 'user-1');
    const b = encrypt('160-0000000012345-67', ring, 'user-1');
    expect(a).not.toBe(b);
    expect(decrypt(a, ring, 'user-1')).toBe('160-0000000012345-67');
  });

  it('rejects tampering and a wrong AAD (binding to the owner)', () => {
    const ring = parseKeyRing(`v1:${k1}`, 'v1');
    const payload = encrypt('Pera Perić', ring, 'user-1');
    expect(() => decrypt(payload, ring, 'user-2')).toThrow();
    const [v, iv, ct, tag] = payload.split(':');
    const flipped = Buffer.from(ct as string, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() =>
      decrypt([v, iv, flipped.toString('base64'), tag].join(':'), ring, 'user-1'),
    ).toThrow();
  });

  it('decrypts old versions after rotation and re-encrypts with the active key', () => {
    const old = parseKeyRing(`v1:${k1}`, 'v1');
    const payload = encrypt('secret', old);
    const rotated = parseKeyRing(`v1:${k1},v2:${k2}`, 'v2');
    expect(decrypt(payload, rotated)).toBe('secret');
    const upgraded = rotate(payload, rotated);
    expect(keyVersionOf(upgraded)).toBe('v2');
    expect(decrypt(upgraded, parseKeyRing(`v2:${k2}`, 'v2'))).toBe('secret');
  });

  it('validates key ring configuration', () => {
    expect(() => parseKeyRing('v1:short', 'v1')).toThrow();
    expect(() => parseKeyRing(`v1:${k1}`, 'v2')).toThrow();
  });
});
