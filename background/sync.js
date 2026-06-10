/**
 * Cloud Sync — encrypted multi-device sync (Pro). Owned by Core Engine.
 *
 * Transport: Supabase (Postgres + Auth over REST). Storage owns the crypto
 * (encryptBlob/decryptBlob) and the merge (mergeVault); this file owns auth,
 * the network transport, and the sync orchestration.
 *
 * Design rules:
 *   - Sync NEVER talks to chrome.storage for vault data. It receives the full
 *     vault from the engine and returns the merged vault to persist back.
 *   - The whole vault (sessions + folders + smartFolders + spaces) is synced,
 *     last-write-wins per record (mergeVault).
 *   - The vault is encrypted client-side before it leaves the device. The
 *     passphrase is supplied per-sync by the UI and is NEVER persisted.
 *   - The auth session (tokens) lives in its own chrome.storage key and is
 *     never exposed through getStatus().
 *
 * Public status shape (getStatus / sync) — safe to send to the UI:
 * {
 *   enabled:  boolean,
 *   state:    'idle' | 'syncing' | 'error' | 'disabled',
 *   lastSync: number | null,   // unix ms
 *   error:    string | null,
 *   email:    string | null    // signed-in account, for display
 * }
 *
 * Sync order is PULL → MERGE → PUSH so a peer's newer records are never
 * clobbered on the server (push-first would overwrite them).
 */

import { encryptBlob, decryptBlob } from '../storage/crypto.js';
import { mergeVault } from '../storage/sync-support.js';

// Publishable creds — safe to ship in client code (RLS protects rows).
const SUPABASE_URL = 'https://rbsdtmjhhstqhqgddltu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-HOOGqi7Fors-Q7ncEDO6Q_lWUkkIzT';

const SYNC_STATE_KEY = 'syncState'; // public status
const SYNC_AUTH_KEY = 'syncAuth';   // private: tokens, never returned to UI

const DISABLED_STATUS = {
  enabled: false,
  state: 'disabled',
  lastSync: null,
  error: null,
  email: null,
};

// ─── Status (public) ─────────────────────────────────────────────────────────────

export async function getStatus() {
  const { [SYNC_STATE_KEY]: status } = await chrome.storage.local.get(SYNC_STATE_KEY);
  return { ...DISABLED_STATUS, ...status };
}

async function setStatus(partial) {
  const current = await getStatus();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: next });
  return next;
}

// ─── Auth session (private) ──────────────────────────────────────────────────────

async function getAuth() {
  const { [SYNC_AUTH_KEY]: auth } = await chrome.storage.local.get(SYNC_AUTH_KEY);
  return auth ?? null;
}
async function setAuth(auth) {
  await chrome.storage.local.set({ [SYNC_AUTH_KEY]: auth });
  return auth;
}
async function clearAuth() {
  await chrome.storage.local.remove(SYNC_AUTH_KEY);
}

// Normalise a Supabase token response into our stored auth shape.
function toAuth(json, email) {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    userId: json.user?.id ?? json.user_id ?? null,
    email: json.user?.email ?? email ?? null,
    // expires_in is seconds; keep a small safety margin when checking.
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

async function signInWithPassword(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('AUTH_FAILED: wrong email or password');
  return toAuth(await res.json(), email);
}

async function signUpWithPassword(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let msg = `sign-up failed (${res.status})`;
    try { const j = await res.json(); msg = j.msg || j.error_description || j.message || msg; } catch {}
    throw new Error('AUTH_FAILED: ' + msg);
  }
  const json = await res.json();
  // With "Confirm email" enabled Supabase returns a user but no session yet.
  if (!json.access_token) throw new Error('AUTH_CONFIRM_REQUIRED: confirm your email, then sign in');
  return toAuth(json, email);
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) { await clearAuth(); throw new Error('AUTH_EXPIRED: sign in again'); }
  return setAuth(toAuth(await res.json()));
}

// Returns a valid { accessToken, userId }, refreshing the token if it's near expiry.
async function getValidToken() {
  let auth = await getAuth();
  if (!auth || !auth.accessToken) throw new Error('AUTH_REQUIRED: sign in to sync');
  if (Date.now() > auth.expiresAt - 60_000) auth = await refreshSession(auth.refreshToken);
  return { accessToken: auth.accessToken, userId: auth.userId };
}

// ─── Remote transport (Supabase REST) ───────────────────────────────────────────

async function pushRemote(blob, accessToken, userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vaults`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates', // upsert on user_id
    },
    body: JSON.stringify({ user_id: userId, blob, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`push failed: ${res.status} ${await res.text()}`);
}

async function pullRemote(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vaults?select=blob&limit=1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  const rows = await res.json();
  return rows[0]?.blob ?? null;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Enable sync by authenticating. `credentials` = { email, password, signUp? }.
 * `signUp: true` registers a new account; otherwise it signs in. Stores the auth
 * session; the passphrase is NOT part of this (per-sync only).
 */
export async function enable(credentials = {}) {
  const { email, password, signUp } = credentials;
  if (!email || !password) throw new Error('AUTH_FAILED: email and password required');
  const auth = signUp
    ? await signUpWithPassword(email, password)
    : await signInWithPassword(email, password);
  await setAuth(auth);
  return setStatus({ enabled: true, state: 'idle', error: null, email: auth.email });
}

/** Disable sync and forget the auth session. */
export async function disable() {
  await clearAuth();
  return setStatus({ ...DISABLED_STATUS });
}

/**
 * PULL the remote vault → MERGE with local → PUSH the merged result.
 *
 * @param {Object} localVault  full vault from storage.exportData()
 * @param {Object} [opts]
 * @param {string} [opts.passphrase]  E2E passphrase, supplied per-sync, never stored.
 * @returns {Promise<{ status, merged: Object }>}  merged = vault to persist.
 *        On disabled/error, merged === localVault and the engine skips the write.
 */
export async function sync(localVault, { passphrase } = {}) {
  const status = await getStatus();
  if (!status.enabled) return { status, merged: localVault };
  if (!passphrase) {
    const next = await setStatus({ state: 'error', error: 'Passphrase required for sync' });
    return { status: next, merged: localVault };
  }

  await setStatus({ state: 'syncing', error: null });
  try {
    const { accessToken, userId } = await getValidToken();

    // pull → decrypt → merge → encrypt → push (peer-safe order)
    const remoteBlob = await pullRemote(accessToken);
    const remoteVault = remoteBlob ? await decryptBlob(remoteBlob, passphrase) : {};
    const merged = mergeVault(localVault, remoteVault);

    const blob = await encryptBlob(merged, passphrase);
    await pushRemote(blob, accessToken, userId);

    const next = await setStatus({ state: 'idle', lastSync: Date.now() });
    return { status: next, merged };
  } catch (err) {
    const next = await setStatus({ state: 'error', error: err.message });
    return { status: next, merged: localVault };
  }
}
