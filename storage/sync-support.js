/**
 * Sync support — merge logic for multi-device sync (Storage-owned data logic).
 *
 * Core's sync.js already merges *sessions* (last-write-wins by updatedAt). When
 * the sync payload grows to the full vault, the user's organization — folders,
 * smart folders, project spaces — must merge by the same policy or devices
 * silently drift. Every one of those records carries an `updatedAt`, exactly so
 * this works. These are pure functions: no chrome.storage, no crypto, no
 * transport — Core composes them around its push/pull.
 *
 * The encrypted blob itself stays a direct crypto.js call in sync.js
 * (encryptBlob/decryptBlob) — no wrapper needed here.
 */

/** Collections that make up a full vault, in dependency-friendly order. */
export const VAULT_COLLECTIONS = ['sessions', 'folders', 'smartFolders', 'spaces'];

/**
 * Last-write-wins merge of two `{ [id]: record }` maps by `updatedAt`.
 * Generic over any collection whose records carry an `updatedAt` timestamp.
 * Records missing `updatedAt` are treated as oldest (0). Pure — returns a new map.
 */
export function mergeByUpdatedAt(local = {}, remote = {}) {
  const merged = { ...local };
  for (const [id, remoteRec] of Object.entries(remote)) {
    const localRec = merged[id];
    if (!localRec || (remoteRec?.updatedAt ?? 0) > (localRec?.updatedAt ?? 0)) {
      merged[id] = remoteRec;
    }
  }
  return merged;
}

/**
 * Merges two full vaults — sessions + all organization collections —
 * last-write-wins per record. Unknown extra keys on either side are ignored;
 * only VAULT_COLLECTIONS are merged. Pure.
 *
 * @param {Object} localVault  { sessions?, folders?, smartFolders?, spaces? }
 * @param {Object} remoteVault same shape
 * @returns {Object} merged vault with every VAULT_COLLECTIONS key present
 */
export function mergeVault(localVault = {}, remoteVault = {}) {
  const out = {};
  for (const key of VAULT_COLLECTIONS) {
    out[key] = mergeByUpdatedAt(localVault[key] ?? {}, remoteVault[key] ?? {});
  }
  return out;
}
