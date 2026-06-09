# Encrypted sync — crypto contract

Agreement between **Core** (`background/sync.js`, consumer) and **Storage**
(`storage/crypto.js`, implementer) for the encrypted cloud sync (Pro).

Storage owns the crypto module; Core owns transport + merge. `sync.js` imports
the two functions below and nothing else.

## Signatures (LOCKED)

```ts
// storage/crypto.js
export async function encryptBlob(obj: object, passphrase: string): Promise<string>
export async function decryptBlob(cipher: string, passphrase: string): Promise<object>
```

## Behaviour

**`encryptBlob(obj, passphrase)`**
- Serializes `obj` with `JSON.stringify`, encrypts with **AES-GCM**.
- Key derived from `passphrase` via **PBKDF2** (SubtleCrypto), random salt per call.
- Returns ONE opaque, transport/storage-safe **string** (base64), self-contained:
  it must embed everything `decryptBlob` needs — `salt + iv + ciphertext` — plus a
  small format/version marker (e.g. a leading `v1.` or a JSON envelope) so the
  algorithm can evolve later.
- Throws if `passphrase` is empty.

**`decryptBlob(cipher, passphrase)`**
- Inverse of `encryptBlob`; returns the original object.
- Throws on a wrong passphrase or tampered/corrupt data (AES-GCM auth failure).
  The error **message must start with `DECRYPT_FAILED`** so Core can surface a
  clean "wrong passphrase or corrupted backup" instead of a raw crypto error.

## Round-trip invariant

```js
decryptBlob(await encryptBlob(obj, pass), pass)  // deep-equals obj
encryptBlob(obj, pass)                            // ≠ encryptBlob(obj, pass) (random salt/iv)
```

## How Core uses it

- `sync.js` calls `encryptBlob({ sessions }, passphrase)` before pushing, and
  `decryptBlob(remoteBlob, passphrase)` after pulling.
- The **passphrase is supplied per-sync** by the UI (`SYNC_NOW` payload) and is
  **never persisted** — that's the point of end-to-end encryption. Storage's
  crypto module must not cache it either.

## Status

- `sync.js` is wired to this signature today, using temporary identity stubs.
  When `storage/crypto.js` ships, the swap in `sync.js` is: delete the two stubs,
  uncomment `import { encryptBlob, decryptBlob } from '../storage/crypto.js';`.
- No transport backend yet (`pushRemote`/`pullRemote` throw) — crypto can be
  built and unit-tested independently of transport.
