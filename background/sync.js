/**
 * Cloud Sync — SCAFFOLD (paid feature)
 *
 * Owned by Core Engine. Defines the contract the rest of the team builds
 * against; the actual network/crypto implementation lands later.
 *
 * Design rules:
 *   - Sync NEVER talks to chrome.storage directly. It receives sessions from
 *     the engine and returns sessions to merge back. Storage stays the single
 *     source of truth on disk.
 *   - All payloads are encrypted client-side before leaving the device
 *     (encrypted cloud sync is the paid promise). Encryption is stubbed here.
 *   - Every method is safe to call when sync is disabled — it resolves to a
 *     no-op status rather than throwing.
 *
 * Status shape (returned by getStatus / sync):
 * {
 *   enabled:  boolean,
 *   state:    'idle' | 'syncing' | 'error' | 'disabled',
 *   lastSync: number | null,   // unix ms
 *   error:    string | null
 * }
 */

import { encryptBlob, decryptBlob } from '../storage/crypto.js';

const SYNC_STATE_KEY = 'syncState';

const DISABLED_STATUS = {
  enabled: false,
  state: 'disabled',
  lastSync: null,
  error: null,
};

// ─── Status persistence ────────────────────────────────────────────────────────

export async function getStatus() {
  const { [SYNC_STATE_KEY]: status } = await chrome.storage.local.get(SYNC_STATE_KEY);
  return status ?? { ...DISABLED_STATUS };
}

async function setStatus(partial) {
  const current = await getStatus();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: next });
  return next;
}

// ─── Encryption ────────────────────────────────────────────────────────────────
// Provided by storage/crypto.js per docs/CRYPTO_CONTRACT.md:
//   encryptBlob(obj, passphrase) → transport-safe string (AES-GCM, PBKDF2 key)
//   decryptBlob(cipher, passphrase) → object; throws 'DECRYPT_FAILED…' on bad key.
// Imported at the top of this file.

// ─── Remote transport (STUB) ───────────────────────────────────────────────────
// TODO(core): implement against the sync backend once chosen.
// Contract: pushRemote stores the blob; pullRemote returns the last blob (or null).

async function pushRemote(_blob) {
  throw new Error('Cloud sync backend not implemented yet');
}

async function pullRemote() {
  throw new Error('Cloud sync backend not implemented yet');
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Enable sync. `credentials` shape TBD (token / passphrase). */
export async function enable(_credentials) {
  return setStatus({ enabled: true, state: 'idle', error: null });
}

export async function disable() {
  return setStatus({ ...DISABLED_STATUS });
}

/**
 * Push local sessions up and merge remote sessions down.
 *
 * @param {Object} localSessions  { [id]: Session } from storage
 * @param {Object} [opts]
 * @param {string} [opts.passphrase]  E2E passphrase — supplied per-sync by the
 *        UI, never persisted (keeping it off disk is the point of E2E crypto).
 * @returns {Promise<{ status, merged: Object }>}  merged = sessions to persist
 *
 * Merge policy: last-write-wins by updatedAt (see mergeSessions).
 */
export async function sync(localSessions, { passphrase } = {}) {
  const status = await getStatus();
  if (!status.enabled) {
    return { status, merged: localSessions };
  }

  await setStatus({ state: 'syncing', error: null });
  try {
    const blob = await encryptBlob({ sessions: localSessions }, passphrase);
    await pushRemote(blob);

    const remoteBlob = await pullRemote();
    const remote = remoteBlob ? await decryptBlob(remoteBlob, passphrase) : { sessions: {} };
    const merged = mergeSessions(localSessions, remote.sessions);

    const next = await setStatus({ state: 'idle', lastSync: Date.now() });
    return { status: next, merged };
  } catch (err) {
    const next = await setStatus({ state: 'error', error: err.message });
    return { status: next, merged: localSessions };
  }
}

/** Last-write-wins merge by updatedAt. Pure function — safe to unit test. */
export function mergeSessions(local, remote) {
  const merged = { ...local };
  for (const [id, remoteSession] of Object.entries(remote)) {
    const localSession = merged[id];
    if (!localSession || remoteSession.updatedAt > localSession.updatedAt) {
      merged[id] = remoteSession;
    }
  }
  return merged;
}
