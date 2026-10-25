import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Application-level encryption for payout details (SPEC §3.2, §7.1): AES-256-GCM with
 * versioned keys. Ciphertext format: "<version>:<iv b64>:<ciphertext b64>:<tag b64>".
 * Rotation: add a new key version, switch the active version, re-encrypt (RUNBOOK.md).
 */

export interface KeyRing {
  active: string;
  keys: Map<string, Buffer>;
}

export function parseKeyRing(spec: string, active: string): KeyRing {
  const keys = new Map<string, Buffer>();
  for (const entry of spec.split(',')) {
    const [version, key] = entry.split(':');
    if (!version || !key) throw new Error('invalid key ring entry');
    const buffer = Buffer.from(key, 'base64');
    if (buffer.length !== 32) throw new Error(`key ${version} must be 32 bytes`);
    keys.set(version, buffer);
  }
  if (!keys.has(active)) throw new Error(`active key ${active} missing`);
  return { active, keys };
}

export function encrypt(plaintext: string, ring: KeyRing, aad = ''): string {
  const key = ring.keys.get(ring.active) as Buffer;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    ring.active,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    cipher.getAuthTag().toString('base64'),
  ].join(':');
}

export function decrypt(payload: string, ring: KeyRing, aad = ''): string {
  const [version, iv, ciphertext, tag] = payload.split(':');
  if (!version || !iv || !ciphertext || !tag) throw new Error('malformed ciphertext');
  const key = ring.keys.get(version);
  if (!key) throw new Error(`unknown key version ${version}`);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function keyVersionOf(payload: string): string | null {
  return payload.split(':')[0] ?? null;
}

/** Re-encrypts with the active key if the payload uses an older version. */
export function rotate(payload: string, ring: KeyRing, aad = ''): string {
  return keyVersionOf(payload) === ring.active
    ? payload
    : encrypt(decrypt(payload, ring, aad), ring, aad);
}
