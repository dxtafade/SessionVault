/**
 * Entitlements — free vs Pro feature gating (Core Engine owned).
 *
 * Single source of truth for "is this user Pro?" and the free-tier limits.
 * Owns its own chrome.storage key (`entitlements`), same pattern as sync.js.
 *
 * NOTE: this is the gate, not the billing. Real licence validation (store
 * receipt / server check) lands later; for now `pro` is a plain persisted
 * flag plus a dev toggle (SET_PRO) so the team can build the paid UI.
 *
 * Tier boundary (see docs/TIERS.md):
 *   Free  — manual save/restore, crash recovery (unlimited), search,
 *           export/import, trash, lock, basic folders, up to 50 saved sessions.
 *   Pro   — timed autosave, encrypted cloud sync, unlimited history,
 *           smart folders, dedup, project spaces.
 */

const ENTITLEMENTS_KEY = 'entitlements';

const DEFAULT_ENTITLEMENTS = {
  pro: false,
};

// Free plan caps the number of *manually saved* sessions. Crash-recovery
// snapshots and history are NOT counted — the "never lose your tabs" safety
// net always works, paid or not.
export const FREE_SESSION_LIMIT = 50;

export async function getEntitlements() {
  const { [ENTITLEMENTS_KEY]: e } = await chrome.storage.local.get(ENTITLEMENTS_KEY);
  return { ...DEFAULT_ENTITLEMENTS, ...e };
}

export async function isPro() {
  const { pro } = await getEntitlements();
  return pro === true;
}

/**
 * Dev/stub setter. Replace with real licence activation later.
 * Returns the updated entitlements.
 */
export async function setPro(pro) {
  const next = { ...(await getEntitlements()), pro: pro === true };
  await chrome.storage.local.set({ [ENTITLEMENTS_KEY]: next });
  return next;
}
