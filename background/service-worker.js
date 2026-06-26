/**
 * Core Engine — service worker
 *
 * Responsibility: browser event handling, session logic, autosave scheduler.
 * Talks to Storage via storage.js and exposes a message API for the UI.
 *
 * Message API (chrome.runtime.sendMessage / popup → engine):
 *   { action: 'GET_OPEN_TABS' }                                      → { tabs: [{ id, url, title, favIconUrl, pinned }] }   (open tabs, for the save picker)
 *   { action: 'SAVE_SESSION',      payload: { name, tabIds?, closeTabs? } } → { session }   (free: throws 'FREE_LIMIT_REACHED: …' at 50 saved; tabIds = save only those open tabs, omit = all; also closes the saved tabs unless closeTabs:false — pinned spared when saving all, the desk page always kept)
 *   { action: 'RESTORE_SESSION',   payload: { id } }                → { ok }
 *   { action: 'RESTORE_TAB',       payload: { url } }               → { ok }   (opens one tab)
 *   { action: 'DELETE_SESSION',    payload: { id, force? } }        → { ok }   (soft delete → trash)
 *   { action: 'RENAME_SESSION',    payload: { id, name } }          → { session }
 *   { action: 'DUPLICATE_SESSION', payload: { id, name? } }         → { session }
 *   { action: 'GET_SESSIONS' }                                       → { sessions }
 *   { action: 'GET_SESSION',       payload: { id } }                → { session }
 *   { action: 'GET_SETTINGS' }                                       → { settings }
 *   { action: 'UPDATE_SETTINGS',   payload: { ...partial } }        → { settings }
 *   { action: 'GET_RECOVERY' }                                       → { recovery: { available, tabCount, missingCount, savedAt } }  (peek, no side effects)
 *   { action: 'DISMISS_RECOVERY' }                                   → { ok }   (hide the crash-recovery prompt)
 *   { action: 'RECOVER_LAST',      payload: { name? } }             → { session | null }   (restores the pre-crash tabs)
 *   { action: 'EXPORT_SESSIONS' }                                    → { json }
 *   { action: 'IMPORT_SESSIONS',   payload: { json, mode? } }       → { imported, skipped }
 *   { action: 'SEARCH_SESSIONS',   payload: { query } }             → { results }
 *   { action: 'EXPORT_SESSION_TEXT', payload: { id } }              → { text }   (tab urls, newline-joined)
 *   { action: 'GET_STORAGE_STATS' }                                  → { stats }
 *
 *   Trash (soft delete):
 *   { action: 'GET_TRASH' }                                          → { trash }
 *   { action: 'RESTORE_FROM_TRASH', payload: { id } }               → { session }
 *   { action: 'DELETE_FROM_TRASH',  payload: { id } }               → { ok }
 *   { action: 'EMPTY_TRASH' }                                        → { ok }
 *   { action: 'PURGE_TRASH',       payload: { ttlDays? } }          → { purged }
 *
 *   Lock:
 *   { action: 'LOCK_SESSION',      payload: { id } }                → { session }
 *   { action: 'UNLOCK_SESSION',    payload: { id } }                → { session }
 *
 *   Folders (free — basic organization; persistence owned by storage.js):
 *   { action: 'GET_FOLDERS' }                                        → { folders }
 *   { action: 'CREATE_FOLDER',     payload: { name, color? } }      → { folder }
 *   { action: 'RENAME_FOLDER',     payload: { id, name } }          → { folder }
 *   { action: 'DELETE_FOLDER',     payload: { id, reassignTo? } }   → { ok }   (members reassigned, default unfiled)
 *   { action: 'MOVE_SESSION_TO_FOLDER', payload: { id, folderId } } → { session }  (folderId null = unfile)
 *   { action: 'GET_SESSIONS_IN_FOLDER', payload: { folderId } }     → { sessions }  (array; folderId null = unfiled)
 *
 *   Deduplication (Pro):
 *   { action: 'DEDUPLICATE_SESSION', payload: { id } }              → { session, removed }
 *   { action: 'FIND_DUPLICATE_SESSIONS' }                            → { groups }   (string[][] of session ids)
 *
 *   Tags (free):
 *   { action: 'ADD_TAG',           payload: { id, tag } }           → { session }
 *   { action: 'REMOVE_TAG',        payload: { id, tag } }           → { session }
 *   { action: 'GET_ALL_TAGS' }                                       → { tags }     (string[], sorted)
 *   { action: 'GET_SESSIONS_BY_TAG', payload: { tag } }             → { sessions }
 *
 *   Smart folders (Pro — rule-driven; reads ungated, mutations gated):
 *   { action: 'GET_SMART_FOLDERS' }                                  → { smartFolders }
 *   { action: 'CREATE_SMART_FOLDER', payload: { name, rules, color? } } → { smartFolder }
 *   { action: 'UPDATE_SMART_FOLDER', payload: { id, ...partial } }  → { smartFolder }
 *   { action: 'DELETE_SMART_FOLDER', payload: { id } }              → { ok }
 *   { action: 'EVALUATE_SMART_FOLDER', payload: { id } }            → { sessions }
 *   { action: 'PREVIEW_RULES',     payload: { rules } }             → { sessions }  (live preview before save)
 *   { action: 'GET_SMART_FOLDER_COUNTS' }                            → { counts }    (rules schema: see storage/smart-folders.js)
 *
 *   Spaces (Pro — Space > Folder > Session; reads ungated, mutations gated):
 *   { action: 'GET_SPACES' }                                         → { spaces }
 *   { action: 'CREATE_SPACE',      payload: { name, color?, icon? } } → { space }
 *   { action: 'UPDATE_SPACE',      payload: { id, ...partial } }    → { space }
 *   { action: 'DELETE_SPACE',      payload: { id, reassignTo? } }   → { ok }
 *   { action: 'ASSIGN_SESSION_TO_SPACE', payload: { id, spaceId } } → { session }
 *   { action: 'ASSIGN_FOLDER_TO_SPACE',  payload: { folderId, spaceId } } → { folder }
 *   { action: 'GET_SESSIONS_IN_SPACE', payload: { spaceId } }       → { sessions }
 *   { action: 'GET_FOLDERS_IN_SPACE',  payload: { spaceId } }       → { folders }
 *   { action: 'GET_SPACE_COUNTS' }                                   → { counts }
 *
 *   Archive / long history (Pro to archive; list/restore/delete ungated):
 *   { action: 'ARCHIVE_SESSION',   payload: { id } }                → { entry }
 *   { action: 'LIST_ARCHIVED' }                                      → { archived }  (metadata only)
 *   { action: 'RESTORE_ARCHIVED',  payload: { id } }                → { session }   (cap-exempt)
 *   { action: 'DELETE_ARCHIVED',   payload: { id } }                → { ok }
 *
 *   Entitlements (free vs Pro):
 *   { action: 'GET_ENTITLEMENTS' }                                   → { entitlements: { pro }, limits: { freeSessionLimit } }
 *   { action: 'SET_PRO',          payload: { pro } }                → { entitlements }   (dev/stub toggle)
 *
 *   Cloud sync (paid, stubbed):
 *   { action: 'GET_SYNC_STATUS' }                                    → { status }
 *   { action: 'SET_SYNC_ENABLED', payload: { enabled, credentials?: { email, password } } } → { status }   (enabled:true signs in)
 *   { action: 'RECOVER_PASSWORD', payload: { email } }              → { ok }   (sends a Supabase password-reset email)
 *   { action: 'SYNC_NOW',         payload: { passphrase? } }        → { status }   (syncs full vault; passphrase = E2E key, never persisted)
 *   { action: 'ASSESS_PASSPHRASE', payload: { passphrase } }        → { assessment }  ({ score, label, acceptable, warnings })
 *
 * SEARCH_SESSIONS result item: { session, matchedTabs: Tab[], nameMatch: boolean }
 * Sync status shape: { enabled, state, lastSync, error } — see sync.js
 *
 * Free vs Pro (see entitlements.js / docs/TIERS.md):
 *   - Timed autosave runs only for Pro; on free the alarm is never armed.
 *   - Free is capped at 50 manually-saved sessions; SAVE_SESSION / DUPLICATE_SESSION
 *     throw 'FREE_LIMIT_REACHED: …' at the cap (UI matches the prefix → upgrade prompt).
 *   - Free: basic folders, tags. Pro (throw 'PRO_REQUIRED: …' on free):
 *     deduplication, smart folders, spaces, and archiving a session.
 *   - Crash recovery (RECOVER_LAST), import, and restoring from trash/archive
 *     are exempt — retrieving your own data always works, regardless of plan.
 */

import {
  getAllSessions,
  getSession,
  saveSession,
  deleteSession,
  getSettings,
  updateSettings,
  migrateIfNeeded,
  searchSessions as storageSearch,
  trashSession,
  getTrash,
  restoreFromTrash,
  deleteFromTrash,
  emptyTrash,
  purgeExpiredTrash,
  lockSession,
  unlockSession,
  exportData,
  importData,
  exportSessionAsText,
  getStorageStats,
  deduplicateTabs,
  findDuplicateSessions,
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  assignSessionToFolder,
  getSessionsInFolder,
  addTag,
  removeTag,
  getAllTags,
  getSessionsByTag,
  archiveSession,
  restoreArchived,
  deleteArchived,
  listArchived,
  autoArchiveOldSessions,
} from '../storage/storage.js';

import {
  getSmartFolders,
  createSmartFolder,
  updateSmartFolder,
  deleteSmartFolder,
  evaluateSmartFolder,
  previewRules,
  getSmartFolderCounts,
} from '../storage/smart-folders.js';

import {
  getSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
  assignSessionToSpace,
  assignFolderToSpace,
  getSessionsInSpace,
  getFoldersInSpace,
  getSpaceCounts,
} from '../storage/spaces.js';

import * as sync from './sync.js';
import { assessPassphrase } from '../storage/crypto.js';
import { isPro, getEntitlements, setPro, FREE_SESSION_LIMIT } from './entitlements.js';

// ─── URL filtering ────────────────────────────────────────────────────────────

const SKIP_SCHEMES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

function isRestoreable(url) {
  if (!url) return false;
  return !SKIP_SCHEMES.some(s => url.startsWith(s));
}

// Tabs are only ever re-opened over http(s). A captured or (especially) an
// imported session could otherwise carry javascript:/data:/file: URLs that
// must never be auto-opened on restore. Defense-in-depth alongside isRestoreable.
function isSafeRestoreUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Stable fingerprint of the current tab set — used for autosave change detection.
function tabsFingerprint(tabs) {
  return tabs
    .map(t => t.url)
    .sort()
    .join('\n');
}

// ─── Tab capture (multi-window) ───────────────────────────────────────────────

async function captureCurrentTabs() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const tabs = [];

  windows.forEach((win, windowIndex) => {
    win.tabs.forEach(t => {
      if (!isRestoreable(t.url)) return;
      tabs.push({
        url: t.url,
        title: t.title ?? '',
        favIconUrl: t.favIconUrl ?? '',
        pinned: t.pinned,
        index: t.index,
        windowIndex,
      });
    });
  });

  return tabs;
}

// Close the currently-open tabs after a MANUAL save — "save open tabs" = clear the
// browser so the user doesn't have to close everything by hand. Only touches the
// same restoreable tabs we capture (chrome-extension://, chrome://, etc. are in
// SKIP_SCHEMES, so the extension's own desk page stays open). `tabIds` mirrors the
// save picker (openTabId scheme): when given, close exactly those; when omitted
// (save all), close everything restoreable but spare pinned tabs. Best-effort: a
// failure here never fails the save. NOT used by autosave.
async function closeOpenTabs(tabIds) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const wanted = Array.isArray(tabIds) ? new Set(tabIds) : null;
  const ids = [];
  windows.forEach((win, windowIndex) => {
    win.tabs.forEach((t) => {
      if (typeof t.id !== 'number' || !isRestoreable(t.url)) return;
      if (wanted) { if (wanted.has(openTabId({ windowIndex, index: t.index }))) ids.push(t.id); }
      else if (!t.pinned) ids.push(t.id);
    });
  });
  if (ids.length) { try { await chrome.tabs.remove(ids); } catch (_) {} }
}

// ─── Core actions ─────────────────────────────────────────────────────────────

// Stable per-open-tab id used by the save-tabs picker (GET_OPEN_TABS → SAVE_SESSION).
// MUST stay identical in both places or the subset filter won't match.
const openTabId = (t) => `${t.windowIndex}:${t.index}`;

// `tabIds` (optional): save only the open tabs whose id is in the list; omit to save all.
async function saveCurrentSession(name, isAuto = false, tabIds = null) {
  let tabs = await captureCurrentTabs();
  if (Array.isArray(tabIds)) {
    const keep = new Set(tabIds);
    tabs = tabs.filter((t) => keep.has(openTabId(t)));
  }
  const now = Date.now();
  const session = {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    tabs,
    isAuto,
    folderId: null, // unfiled until moved into a folder
  };
  await saveSession(session);
  return session;
}

async function restoreSession(id) {
  const session = await getSession(id);
  if (!session) throw new Error(`Session ${id} not found`);

  // Only re-open http(s) tabs (drops any javascript:/data:/file: that slipped
  // in via import). Nothing safe to open → no-op.
  const safeTabs = session.tabs.filter(t => isSafeRestoreUrl(t.url));
  if (safeTabs.length === 0) return;

  // Group by windowIndex, preserving original window order
  const byWindow = new Map();
  for (const tab of safeTabs) {
    const wi = tab.windowIndex ?? 0;
    if (!byWindow.has(wi)) byWindow.set(wi, []);
    byWindow.get(wi).push(tab);
  }

  for (const [, tabs] of [...byWindow.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = tabs.slice().sort((a, b) => a.index - b.index);
    const win = await chrome.windows.create({ url: sorted[0].url });

    for (const tab of sorted.slice(1)) {
      await chrome.tabs.create({ windowId: win.id, url: tab.url, pinned: tab.pinned });
    }
    // Pin the first tab now that it exists
    if (sorted[0].pinned) {
      const [first] = await chrome.tabs.query({ windowId: win.id, index: 0 });
      if (first) await chrome.tabs.update(first.id, { pinned: true });
    }
  }
}

async function pruneAutoSessions() {
  const settings = await getSettings();
  const sessions = await getAllSessions();
  const autoSessions = Object.values(sessions)
    .filter(s => s.isAuto && !s.locked) // never prune a locked session
    .sort((a, b) => b.createdAt - a.createdAt);

  for (const s of autoSessions.slice(settings.maxAutoSessions)) {
    await deleteSession(s.id);
  }
}

// ─── Free-tier limit ────────────────────────────────────────────────────────
// Stable error prefix the UI matches on to show an upgrade prompt.
const FREE_LIMIT_ERROR = 'FREE_LIMIT_REACHED';

// Throws when a free user is at the manual-save cap. What does NOT count:
//   - autosaves (Pro-only anyway)        - trashed sessions (already removed)
//   - crash recovery + import            → those are recovery flows, exempt,
//     so "never lose your tabs" holds regardless of plan.
async function assertCanSaveManual() {
  if (await isPro()) return;
  const sessions = await getAllSessions();
  const manualCount = Object.values(sessions).filter(s => !s.isAuto).length;
  if (manualCount >= FREE_SESSION_LIMIT) {
    throw new Error(
      `${FREE_LIMIT_ERROR}: Free plan allows ${FREE_SESSION_LIMIT} saved sessions. ` +
        'Delete some or upgrade to Pro.',
    );
  }
}

// Stable error prefix the UI matches on to show an upgrade prompt for a
// Pro-only feature (e.g. deduplication).
const PRO_REQUIRED_ERROR = 'PRO_REQUIRED';

async function assertPro(feature) {
  if (await isPro()) return;
  throw new Error(`${PRO_REQUIRED_ERROR}: "${feature}" is a Pro feature. Upgrade to use it.`);
}

// ─── Search ───────────────────────────────────────────────────────────────────
// Base matching lives in storage.searchSessions (single source of truth).
// The engine only enriches each hit with the tabs that matched, so the UI can
// highlight them.

function enrichSearchHits(sessions, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  return sessions.map(session => ({
    session,
    nameMatch: session.name.toLowerCase().includes(q),
    matchedTabs: q
      ? session.tabs.filter(
          t =>
            (t.title ?? '').toLowerCase().includes(q) ||
            (t.url ?? '').toLowerCase().includes(q),
        )
      : [],
  }));
}

// ─── Crash guard ──────────────────────────────────────────────────────────────
// Keeps a rolling emergency snapshot updated on meaningful tab events.
// Not shown in the sessions list — only surfaced via RECOVER_LAST.

const EMERGENCY_KEY = 'emergencySnapshot';
// A frozen copy of the emergency snapshot taken at browser startup — i.e. the
// tabs that were open just before this launch. The crash-recovery prompt reads
// THIS (not the live, constantly-updated emergency snapshot), so it's stable and
// surfaces at most once per launch. Cleared once recovered or dismissed.
const RECOVERY_KEY = 'recoveryCandidate';

async function updateEmergencySnapshot() {
  const tabs = await captureCurrentTabs();
  if (tabs.length === 0) return;
  await chrome.storage.local.set({
    [EMERGENCY_KEY]: { tabs, savedAt: Date.now() },
  });
}

// On browser startup, freeze the previous session's tabs as the recovery
// candidate BEFORE live tab events overwrite the emergency snapshot.
async function captureRecoveryCandidate() {
  const { [EMERGENCY_KEY]: snap } = await chrome.storage.local.get(EMERGENCY_KEY);
  if (snap && Array.isArray(snap.tabs) && snap.tabs.length > 0) {
    await chrome.storage.local.set({ [RECOVERY_KEY]: { tabs: snap.tabs, savedAt: snap.savedAt } });
  }
}

chrome.tabs.onRemoved.addListener(() => updateEmergencySnapshot());
chrome.tabs.onCreated.addListener(() => updateEmergencySnapshot());
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === 'complete') updateEmergencySnapshot();
});

// Flush before the service worker goes idle
chrome.runtime.onSuspend.addListener(() => updateEmergencySnapshot());

// ─── Autosave ─────────────────────────────────────────────────────────────────

const ALARM_NAME = 'autosave';
let lastAutosaveFingerprint = '';

async function scheduleAutosave() {
  const settings = await getSettings();
  await chrome.alarms.clear(ALARM_NAME);
  // Timed autosave is a Pro feature — only arm the alarm for Pro users.
  if (settings.autosaveEnabled && (await isPro())) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: settings.autosaveInterval });
  }
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;
  if (!(await isPro())) return; // belt-and-suspenders: never autosave on free
  const settings = await getSettings();
  if (!settings.autosaveEnabled) return;

  const tabs = await captureCurrentTabs();
  const fingerprint = tabsFingerprint(tabs);
  if (fingerprint === lastAutosaveFingerprint) return; // nothing changed

  lastAutosaveFingerprint = fingerprint;
  const label = new Date().toLocaleString();
  await saveCurrentSession(`Autosave — ${label}`, true);
  await pruneAutoSessions();
});

// ─── Message API ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(err => {
      console.error('[SessionVault]', err);
      sendResponse({ error: err.message });
    });
  return true; // keep channel open for async response
});

async function handleMessage({ action, payload = {} }) {
  switch (action) {

    case 'GET_OPEN_TABS': {
      // List the currently open tabs so the UI can let the user pick a subset.
      const tabs = await captureCurrentTabs();
      return { tabs: tabs.map((t) => ({
        id: openTabId(t), url: t.url, title: t.title, favIconUrl: t.favIconUrl, pinned: t.pinned,
      })) };
    }

    case 'SAVE_SESSION': {
      await assertCanSaveManual();
      // payload.tabIds (optional) → save only those open tabs; omit → save all.
      const session = await saveCurrentSession(payload.name ?? 'Unnamed session', false, payload.tabIds);
      // "Save open tabs" clears the browser too: close the saved tabs (unless opted out).
      if (payload.closeTabs !== false) await closeOpenTabs(payload.tabIds);
      return { session };
    }

    case 'RESTORE_SESSION': {
      await restoreSession(payload.id);
      return { ok: true };
    }

    case 'RESTORE_TAB': {
      // Open a single saved tab in a new tab (used by the deal-out card view).
      if (!payload.url) throw new Error('RESTORE_TAB needs a url');
      if (!isSafeRestoreUrl(payload.url)) throw new Error('Refusing to open a non-http(s) URL');
      await chrome.tabs.create({ url: payload.url });
      return { ok: true };
    }

    case 'DELETE_SESSION': {
      // Soft delete: moves to trash so the user can undo (purged after 30d).
      // Throws if the session is locked — pass { force: true } to override.
      await trashSession(payload.id, { force: payload.force });
      return { ok: true };
    }

    case 'RENAME_SESSION': {
      const session = await getSession(payload.id);
      if (!session) throw new Error(`Session ${payload.id} not found`);
      session.name = payload.name;
      session.updatedAt = Date.now();
      await saveSession(session);
      return { session };
    }

    case 'DUPLICATE_SESSION': {
      await assertCanSaveManual();
      const source = await getSession(payload.id);
      if (!source) throw new Error(`Session ${payload.id} not found`);
      const now = Date.now();
      const copy = {
        ...source,
        id: generateId(),
        name: payload.name ?? `${source.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        isAuto: false,
      };
      await saveSession(copy);
      return { session: copy };
    }

    case 'GET_SESSION': {
      const session = await getSession(payload.id);
      return { session };
    }

    case 'GET_SESSIONS': {
      const sessions = await getAllSessions();
      return { sessions };
    }

    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { settings };
    }

    case 'UPDATE_SETTINGS': {
      await updateSettings(payload);
      await scheduleAutosave();
      const settings = await getSettings();
      return { settings };
    }

    case 'GET_RECOVERY': {
      // Peek (no side effects): does the crash-recovery prompt have anything to
      // offer? Compares the frozen candidate against currently-open tabs so we
      // don't nag when the browser already reopened everything.
      const { [RECOVERY_KEY]: cand } = await chrome.storage.local.get(RECOVERY_KEY);
      if (!cand || !cand.tabs?.length) {
        return { recovery: { available: false, tabCount: 0, missingCount: 0, savedAt: null } };
      }
      const openUrls = new Set((await captureCurrentTabs()).map(t => t.url));
      const missing = cand.tabs.filter(t => !openUrls.has(t.url));
      return {
        recovery: {
          available: missing.length > 0,
          tabCount: cand.tabs.length,
          missingCount: missing.length,
          savedAt: cand.savedAt,
        },
      };
    }

    case 'DISMISS_RECOVERY': {
      await chrome.storage.local.remove(RECOVERY_KEY);
      return { ok: true };
    }

    case 'RECOVER_LAST': {
      // Prefer the frozen startup candidate (the pre-crash tabs); fall back to
      // the live emergency snapshot so a manual "restore my last tabs" still works.
      const data = await chrome.storage.local.get([RECOVERY_KEY, EMERGENCY_KEY]);
      const snapshot = data[RECOVERY_KEY] ?? data[EMERGENCY_KEY];
      if (!snapshot) return { session: null };

      const now = Date.now();
      const session = {
        id: generateId(),
        name: payload.name ?? `Recovered — ${new Date(snapshot.savedAt).toLocaleString()}`,
        createdAt: now,
        updatedAt: now,
        tabs: snapshot.tabs,
        isAuto: false,
      };
      await saveSession(session);
      await chrome.storage.local.remove(RECOVERY_KEY); // don't prompt again for this one
      return { session };
    }

    case 'EXPORT_SESSIONS': {
      const data = await exportData();
      return { json: JSON.stringify(data, null, 2) };
    }

    case 'IMPORT_SESSIONS': {
      let blob;
      try {
        blob = JSON.parse(payload.json);
      } catch {
        throw new Error('Invalid JSON');
      }
      const { imported, skipped } = await importData(blob, payload.mode ?? 'merge');
      return { imported, skipped };
    }

    case 'SEARCH_SESSIONS': {
      const query = payload.query ?? '';
      const matched = await storageSearch(query);
      return { results: enrichSearchHits(matched, query) };
    }

    // ── Trash (soft delete) — backed by storage's trash model ──

    case 'GET_TRASH': {
      const trash = await getTrash();
      return { trash };
    }

    case 'RESTORE_FROM_TRASH': {
      const session = await restoreFromTrash(payload.id);
      return { session };
    }

    case 'DELETE_FROM_TRASH': {
      await deleteFromTrash(payload.id);
      return { ok: true };
    }

    case 'EMPTY_TRASH': {
      await emptyTrash();
      return { ok: true };
    }

    case 'PURGE_TRASH': {
      const purged = await purgeExpiredTrash(payload.ttlDays);
      return { purged };
    }

    // ── Lock (protect from trashing / autosave pruning) ──

    case 'LOCK_SESSION': {
      const session = await lockSession(payload.id);
      return { session };
    }

    case 'UNLOCK_SESSION': {
      const session = await unlockSession(payload.id);
      return { session };
    }

    // ── Misc storage passthroughs ──

    case 'EXPORT_SESSION_TEXT': {
      const text = await exportSessionAsText(payload.id);
      return { text };
    }

    case 'GET_STORAGE_STATS': {
      const stats = await getStorageStats();
      return { stats };
    }

    // ── Folders (free — basic manual organization) ──

    case 'GET_FOLDERS': {
      const folders = await getFolders();
      return { folders };
    }

    case 'CREATE_FOLDER': {
      if (!(payload.name ?? '').trim()) throw new Error('Folder name is required');
      const folder = await createFolder(payload.name.trim(), { color: payload.color ?? null });
      return { folder };
    }

    case 'RENAME_FOLDER': {
      if (!(payload.name ?? '').trim()) throw new Error('Folder name is required');
      const folder = await renameFolder(payload.id, payload.name.trim());
      return { folder };
    }

    case 'DELETE_FOLDER': {
      // Storage reassigns member sessions (default → unfiled); they're never deleted.
      await deleteFolder(payload.id, { reassignTo: payload.reassignTo ?? null });
      return { ok: true };
    }

    case 'MOVE_SESSION_TO_FOLDER': {
      // folderId null/undefined → unfile. Storage validates the target folder.
      const session = await assignSessionToFolder(payload.id, payload.folderId ?? null);
      return { session };
    }

    case 'GET_SESSIONS_IN_FOLDER': {
      // folderId null → unfiled sessions. Returns array, newest-first.
      const sessions = await getSessionsInFolder(payload.folderId ?? null);
      return { sessions };
    }

    // ── Deduplication (Pro) ──

    case 'DEDUPLICATE_SESSION': {
      await assertPro('Deduplication');
      const source = await getSession(payload.id);
      if (!source) throw new Error(`Session ${payload.id} not found`);
      const deduped = { ...deduplicateTabs(source), updatedAt: Date.now() };
      await saveSession(deduped);
      const removed = source.tabs.length - deduped.tabs.length;
      return { session: deduped, removed };
    }

    case 'FIND_DUPLICATE_SESSIONS': {
      await assertPro('Deduplication');
      const groups = await findDuplicateSessions();
      return { groups };
    }

    // ── Tags (free) ──

    case 'ADD_TAG': {
      const session = await addTag(payload.id, payload.tag);
      return { session };
    }

    case 'REMOVE_TAG': {
      const session = await removeTag(payload.id, payload.tag);
      return { session };
    }

    case 'GET_ALL_TAGS': {
      const tags = await getAllTags();
      return { tags };
    }

    case 'GET_SESSIONS_BY_TAG': {
      const sessions = await getSessionsByTag(payload.tag);
      return { sessions };
    }

    // ── Smart folders (Pro — rule-driven, dynamic membership) ──

    case 'GET_SMART_FOLDERS': {
      const smartFolders = await getSmartFolders();
      return { smartFolders };
    }

    case 'CREATE_SMART_FOLDER': {
      await assertPro('Smart folders');
      const smartFolder = await createSmartFolder(payload.name, payload.rules, {
        color: payload.color ?? null,
      });
      return { smartFolder };
    }

    case 'UPDATE_SMART_FOLDER': {
      await assertPro('Smart folders');
      const { id, ...partial } = payload;
      const smartFolder = await updateSmartFolder(id, partial);
      return { smartFolder };
    }

    case 'DELETE_SMART_FOLDER': {
      await assertPro('Smart folders');
      await deleteSmartFolder(payload.id);
      return { ok: true };
    }

    case 'EVALUATE_SMART_FOLDER': {
      await assertPro('Smart folders');
      const sessions = await evaluateSmartFolder(payload.id);
      return { sessions };
    }

    case 'PREVIEW_RULES': {
      await assertPro('Smart folders');
      const sessions = await previewRules(payload.rules);
      return { sessions };
    }

    case 'GET_SMART_FOLDER_COUNTS': {
      const counts = await getSmartFolderCounts();
      return { counts };
    }

    // ── Spaces (Pro — Space > Folder > Session) ──

    case 'GET_SPACES': {
      const spaces = await getSpaces();
      return { spaces };
    }

    case 'CREATE_SPACE': {
      await assertPro('Spaces');
      const space = await createSpace(payload.name, {
        color: payload.color ?? null,
        icon: payload.icon ?? null,
      });
      return { space };
    }

    case 'UPDATE_SPACE': {
      await assertPro('Spaces');
      const { id, ...partial } = payload;
      const space = await updateSpace(id, partial);
      return { space };
    }

    case 'DELETE_SPACE': {
      await assertPro('Spaces');
      await deleteSpace(payload.id, { reassignTo: payload.reassignTo ?? null });
      return { ok: true };
    }

    case 'ASSIGN_SESSION_TO_SPACE': {
      await assertPro('Spaces');
      const session = await assignSessionToSpace(payload.id, payload.spaceId ?? null);
      return { session };
    }

    case 'ASSIGN_FOLDER_TO_SPACE': {
      await assertPro('Spaces');
      const folder = await assignFolderToSpace(payload.folderId, payload.spaceId ?? null);
      return { folder };
    }

    case 'GET_SESSIONS_IN_SPACE': {
      const sessions = await getSessionsInSpace(payload.spaceId ?? null);
      return { sessions };
    }

    case 'GET_FOLDERS_IN_SPACE': {
      const folders = await getFoldersInSpace(payload.spaceId ?? null);
      return { folders };
    }

    case 'GET_SPACE_COUNTS': {
      const counts = await getSpaceCounts();
      return { counts };
    }

    // ── Archive / long history (Pro to archive; retrieval always allowed) ──
    // Archiving (moving a session out) is the Pro "long history" mechanism, so
    // it's gated. Listing / restoring / deleting archived sessions are NOT
    // gated — a downgraded user must never lose access to their own data.

    case 'ARCHIVE_SESSION': {
      await assertPro('Archive');
      const entry = await archiveSession(payload.id);
      return { entry };
    }

    case 'LIST_ARCHIVED': {
      const archived = await listArchived();
      return { archived };
    }

    case 'RESTORE_ARCHIVED': {
      // Recovery flow — exempt from the 50-session free cap (never lose tabs).
      const session = await restoreArchived(payload.id);
      return { session };
    }

    case 'DELETE_ARCHIVED': {
      await deleteArchived(payload.id);
      return { ok: true };
    }

    // ── Entitlements (free vs Pro) ──

    case 'GET_ENTITLEMENTS': {
      const entitlements = await getEntitlements();
      return { entitlements, limits: { freeSessionLimit: FREE_SESSION_LIMIT } };
    }

    case 'SET_PRO': {
      // Dev/stub toggle — real licence activation lands later.
      const entitlements = await setPro(payload.pro);
      await scheduleAutosave(); // arm/disarm the autosave alarm for the new tier
      return { entitlements };
    }

    // ── Cloud sync (paid) — engine owns the contract, transport is stubbed ──

    case 'GET_SYNC_STATUS': {
      const status = await sync.getStatus();
      return { status };
    }

    case 'SET_SYNC_ENABLED': {
      const status = payload.enabled
        ? await sync.enable(payload.credentials)
        : await sync.disable();
      return { status };
    }

    case 'RECOVER_PASSWORD': {
      // Forgot the account password — send a Supabase reset email. No auth/state
      // change here; the user sets a new password via the emailed link.
      await sync.recoverPassword(payload.email);
      return { ok: true };
    }

    case 'SYNC_NOW': {
      // Sync the FULL vault (sessions + folders + smartFolders + spaces) so
      // organization travels between devices, not just sessions.
      const localVault = await exportData();
      const { status, merged } = await sync.sync(localVault, { passphrase: payload.passphrase });
      // Persist the merged vault only when sync actually ran (enabled + no error);
      // on disabled/error, merged === localVault and we skip the rewrite.
      if (status.enabled && !status.error) {
        await importData(merged, 'replace');
      }
      return { status };
    }

    case 'ASSESS_PASSPHRASE': {
      // Pure strength check for the UI sync-setup indicator. Ungated.
      return { assessment: assessPassphrase(payload.passphrase) };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function bootstrap() {
  await migrateIfNeeded();       // stamp/upgrade storage schema
  await scheduleAutosave();
  await updateEmergencySnapshot();
  await purgeExpiredTrash();      // storage delegates trash GC to the engine
  // Long-history maintenance: bound the hot set for Pro users by archiving
  // old sessions. Free is capped at 50, so it never accumulates a backlog.
  if (await isPro()) {
    await autoArchiveOldSessions();
  }
}

chrome.runtime.onInstalled.addListener(bootstrap);
// On a real browser launch, freeze the pre-restart tabs as the recovery
// candidate FIRST (before live tab events overwrite the snapshot), then boot.
chrome.runtime.onStartup.addListener(async () => {
  await captureRecoveryCandidate();
  await bootstrap();
});

// ─── Toolbar click → open the full-page app ─────────────────────────────────────
// The action has no default_popup, so clicking the toolbar icon fires this.
// We open (or focus) the full-page experience instead of a small popup.

const APP_URL = chrome.runtime.getURL('app/index.html');

chrome.action.onClicked.addListener(async () => {
  const existing = await chrome.tabs.query({ url: APP_URL });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP_URL });
  }
});
