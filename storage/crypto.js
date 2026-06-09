/**
 * Client-side encryption for encrypted cloud sync (Pro).
 *
 * Implements the LOCKED contract in docs/CRYPTO_CONTRACT.md. Core's sync.js
 * imports exactly the two exports below and nothing else; Storage owns the
 * crypto, Core owns transport + merge.
 *
 *   encryptBlob(obj, passphrase) -> Promise<string>   // opaque, self-contained
 *   decryptBlob(cipher, passphrase) -> Promise<object>
 *
 * End-to-end: the passphrase is supplied per call and never persisted or
 * cached here. AES-GCM (authenticated) over JSON, key derived with PBKDF2.
 *
 * Envelope (v1): `v1.` + base64( salt[16] | iv[12] | ciphertext+tag ).
 * Self-contained so decrypt needs only the string + passphrase. The version
 * prefix lets the scheme evolve without breaking old backups.
 */

import { bytesToBase64, base64ToBytes } from './gzip.js';

const VERSION = 'v1';
const PBKDF2_ITERATIONS = 210_000; // OWASP-tier for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12;

// Web Crypto: global in MV3 service workers, the popup, and Node 18+.
const subtle = globalThis.crypto.subtle;

async function deriveKey(passphrase, salt) {
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts an object into one opaque, transport/storage-safe string.
 * Random salt + iv per call, so encrypting the same input twice differs.
 * Throws if `passphrase` is empty.
 */
export async function encryptBlob(obj, passphrase) {
  if (!passphrase) throw new Error('Passphrase is required');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const ct = new Uint8Array(cipherBuf);

  const packed = new Uint8Array(salt.length + iv.length + ct.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(ct, salt.length + iv.length);

  return `${VERSION}.${bytesToBase64(packed)}`;
}

/**
 * Advisory passphrase-strength check for the encrypted-sync UI. The whole E2E
 * guarantee rests on the passphrase, so a weak one quietly undermines it. This
 * does NOT block encryption (that's the user's call) — it returns guidance the
 * UI can surface as a strength meter.
 *
 * Returns { score: 0..4, label, acceptable: boolean, warnings: string[] }.
 */
export function assessPassphrase(passphrase) {
  const pass = String(passphrase ?? '');
  const length = pass.length;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
    .filter(re => re.test(pass)).length;

  let score = 0;
  if (length >= 8) score++;
  if (length >= 12) score++;
  if (classes >= 2) score++;
  if (classes >= 3 && length >= 10) score++;

  const warnings = [];
  if (length < 8) warnings.push('Use at least 8 characters');
  if (classes < 2) warnings.push('Mix letters, numbers, and symbols');

  const labels = ['very weak', 'weak', 'fair', 'good', 'strong'];
  return { score, label: labels[score], acceptable: score >= 2, warnings };
}

/**
 * Reverses encryptBlob, returning the original object.
 * Throws on a wrong passphrase or tampered/corrupt data; the error message
 * starts with `DECRYPT_FAILED` so Core can surface a clean message.
 */
export async function decryptBlob(cipher, passphrase) {
  if (!passphrase) throw new Error('DECRYPT_FAILED: passphrase is required');

  try {
    const str = String(cipher);
    const dot = str.indexOf('.');
    const version = dot === -1 ? '' : str.slice(0, dot);
    const b64 = dot === -1 ? '' : str.slice(dot + 1);
    if (version !== VERSION || !b64) throw new Error('bad envelope');

    const packed = base64ToBytes(b64);
    if (packed.length <= SALT_BYTES + IV_BYTES) throw new Error('truncated');

    const salt = packed.slice(0, SALT_BYTES);
    const iv = packed.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const ct = packed.slice(SALT_BYTES + IV_BYTES);

    const key = await deriveKey(passphrase, salt);
    const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  } catch (err) {
    if (err?.message?.startsWith('DECRYPT_FAILED')) throw err;
    throw new Error('DECRYPT_FAILED: wrong passphrase or corrupted data');
  }
}
