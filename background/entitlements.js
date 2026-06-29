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
 * True when running an unpacked/dev build. Store builds carry an `update_url`
 * in the runtime manifest; unpacked builds loaded via "Load unpacked" do not.
 * Used to keep the `SET_PRO` dev toggle from being a free paywall bypass once
 * the extension ships from the Web Store.
 */
export function isDevBuild() {
  try {
    return !('update_url' in chrome.runtime.getManifest());
  } catch {
    return false; // fail closed — treat unknown environments as production
  }
}

/**
 * Dev-only stub setter — replace with real licence activation later. In a
 * store build this is a no-op: flipping Pro must go through real entitlement
 * validation, not a client-side message, otherwise anyone can unlock Pro by
 * sending SET_PRO from the console. Returns the (unchanged in prod) entitlements.
 */
export async function setPro(pro) {
  if (!isDevBuild()) {
    console.warn('[SessionVault] SET_PRO ignored: not a dev build');
    return getEntitlements();
  }
  const next = { ...(await getEntitlements()), pro: pro === true };
  await chrome.storage.local.set({ [ENTITLEMENTS_KEY]: next });
  return next;
}
