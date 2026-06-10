import { describe, it, expect } from 'vitest';
import { encryptBlob, decryptBlob, assessPassphrase } from './crypto.js';
import { bytesToBase64 } from './gzip.js';

const PASS = 'correct horse battery staple';

// Build a v1 envelope at an arbitrary PBKDF2 iteration count — used to forge a
// "legacy" blob (encrypted before the count was raised) for the fallback test.
async function encryptAtIterations(obj, pass, iterations) {
  const subtle = globalThis.crypto.subtle;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const ctBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  const ct = new Uint8Array(ctBuf);
  const packed = new Uint8Array(salt.length + iv.length + ct.length);
  packed.set(salt, 0); packed.set(iv, salt.length); packed.set(ct, salt.length + iv.length);
  return `v1.${bytesToBase64(packed)}`;
}

describe('encryptBlob / decryptBlob — contract (docs/CRYPTO_CONTRACT.md)', () => {
  it('round-trips an object (deep-equals)', async () => {
    const obj = { sessions: { a: { id: 'a', tabs: [{ url: 'https://x.com' }] } }, n: 42 };
    const cipher = await encryptBlob(obj, PASS);
    expect(await decryptBlob(cipher, PASS)).toEqual(obj);
  });

  it('produces an opaque, versioned string', async () => {
    const cipher = await encryptBlob({ a: 1 }, PASS);
    expect(typeof cipher).toBe('string');
    expect(cipher.startsWith('v1.')).toBe(true);
    expect(cipher).not.toContain('"a"'); // plaintext not present
  });

  it('is non-deterministic (random salt/iv per call)', async () => {
    const a = await encryptBlob({ a: 1 }, PASS);
    const b = await encryptBlob({ a: 1 }, PASS);
    expect(a).not.toBe(b);
    // ...but both decrypt to the same object
    expect(await decryptBlob(a, PASS)).toEqual(await decryptBlob(b, PASS));
  });

  it('throws if the passphrase is empty on encrypt', async () => {
    await expect(encryptBlob({ a: 1 }, '')).rejects.toThrow(/passphrase/i);
  });

  it('fails with DECRYPT_FAILED on the wrong passphrase', async () => {
    const cipher = await encryptBlob({ a: 1 }, PASS);
    await expect(decryptBlob(cipher, 'wrong')).rejects.toThrow(/^DECRYPT_FAILED/);
  });

  it('fails with DECRYPT_FAILED on tampered ciphertext', async () => {
    const cipher = await encryptBlob({ secret: true }, PASS);
    // Flip a character in the base64 body to simulate corruption/tampering.
    const body = cipher.slice(3);
    const flipped = body[10] === 'A' ? 'B' : 'A';
    const tampered = `v1.${body.slice(0, 10)}${flipped}${body.slice(11)}`;
    await expect(decryptBlob(tampered, PASS)).rejects.toThrow(/^DECRYPT_FAILED/);
  });

  it('fails with DECRYPT_FAILED on a malformed envelope', async () => {
    await expect(decryptBlob('not-an-envelope', PASS)).rejects.toThrow(/^DECRYPT_FAILED/);
    await expect(decryptBlob('v2.abc', PASS)).rejects.toThrow(/^DECRYPT_FAILED/);
    await expect(decryptBlob('', PASS)).rejects.toThrow(/^DECRYPT_FAILED/);
  });

  it('handles a large/nested payload', async () => {
    const sessions = {};
    for (let i = 0; i < 100; i++) {
      sessions[`s${i}`] = {
        id: `s${i}`,
        name: `Session ${i}`,
        tabs: Array.from({ length: 20 }, (_, j) => ({ url: `https://site${i}-${j}.com` })),
      };
    }
    const obj = { sessions, settings: { autosaveInterval: 10 } };
    expect(await decryptBlob(await encryptBlob(obj, PASS), PASS)).toEqual(obj);
  });

  it('decrypts a legacy v1 blob (210k iterations) via fallback', async () => {
    const obj = { sessions: { a: { id: 'a', tabs: [] } }, folders: {} };
    const legacy = await encryptAtIterations(obj, PASS, 210_000);
    expect(await decryptBlob(legacy, PASS)).toEqual(obj);
  });

  it('still rejects a legacy-shaped blob under the wrong passphrase', async () => {
    const legacy = await encryptAtIterations({ a: 1 }, PASS, 210_000);
    await expect(decryptBlob(legacy, 'nope')).rejects.toThrow(/^DECRYPT_FAILED/);
  });
});

describe('assessPassphrase', () => {
  it('flags a short/weak passphrase as not acceptable', () => {
    const r = assessPassphrase('abc');
    expect(r.acceptable).toBe(false);
    expect(r.score).toBeLessThan(2);
    expect(r.warnings).toContain('Use at least 8 characters');
  });

  it('rates a long mixed passphrase as strong', () => {
    const r = assessPassphrase('Tr0ub4dour&3xtra');
    expect(r.score).toBe(4);
    expect(r.label).toBe('strong');
    expect(r.acceptable).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('treats empty/nullish as very weak without throwing', () => {
    expect(assessPassphrase('').label).toBe('very weak');
    expect(assessPassphrase(undefined).acceptable).toBe(false);
  });
});
