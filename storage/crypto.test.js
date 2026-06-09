import { describe, it, expect } from 'vitest';
import { encryptBlob, decryptBlob, assessPassphrase } from './crypto.js';

const PASS = 'correct horse battery staple';

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
