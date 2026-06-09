/**
 * Core Engine — service worker
 *
 * Responsibility: browser event handling, session logic, autosave scheduler.
 * Talks to Storage via storage.js and exposes a message API for the UI.
 *
 * Message API (chrome.runtime.sendMessage / popup → engine):
 *   { action: 'SAVE_SESSION',      payload: { name } }              → { session }
 *   { action: 'RESTORE_SESSION',   payload: { id } }                → { ok }
 *   { action: 'DELETE_SESSION',    payload: { id, force? } }        → { ok }   (soft delete → trash)
 *   { action: 'RENAME_SESSION',    payload: { id, name } }          → { session }
 *   { action: 'DUPLICATE_SESSION', payload: { id, name? } }         → { session }
 *   { action: 'GET_SESSIONS' }                                       → { sessions }
 *   { action: 'GET_SESSION',       payload: { id } }                → { session }
 *   { action: 'GET_SETTINGS' }                                       → { settings }
 *   { action: 'UPDATE_SETTINGS',   payload: { ...partial } }        → { settings }
 *   { action: 'RECOVER_LAST',      payload: { name? } }             → { session | null }
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
 *   Cloud sync (paid, stubbed):
 *   { action: 'GET_SYNC_STATUS' }                                    → { status }
 *   { action: 'SET_SYNC_ENABLED', payload: { enabled, credentials? } } → { status }
 *   { action: 'SYNC_NOW' }                                           → { status }
 *
 * SEARCH_SESSIONS result item: { session, matchedTabs: Tab[], nameMatch: boolean }
 * Sync status shape: { enabled, state, lastSync, error } — see sync.js
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
} from '../storage/storage.js';

import * as sync from './sync.js';

// ─── URL filtering ────────────────────────────────────────────────────────────

const SKIP_SCHEMES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

function isRestoreable(url) {
  if (!url) return false;
  return !SKIP_SCHEMES.some(s => url.startsWith(s));
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

// ─── Core actions ─────────────────────────────────────────────────────────────

async function saveCurrentSession(name, isAuto = false) {
  const tabs = await captureCurrentTabs();
  const now = Date.now();
  const session = {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    tabs,
    isAuto,
  };
  await saveSession(session);
  return session;
}

async function restoreSession(id) {
  const session = await getSession(id);
  if (!session) throw new Error(`Session ${id} not found`);

  // Group by windowIndex, preserving original window order
  const byWindow = new Map();
  for (const tab of session.tabs) {
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

async function updateEmergencySnapshot() {
  const tabs = await captureCurrentTabs();
  if (tabs.length === 0) return;
  await chrome.storage.local.set({
    [EMERGENCY_KEY]: { tabs, savedAt: Date.now() },
  });
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
  if (settings.autosaveEnabled) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: settings.autosaveInterval });
  }
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;
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

    case 'SAVE_SESSION': {
      const session = await saveCurrentSession(payload.name ?? 'Unnamed session');
      return { session };
    }

    case 'RESTORE_SESSION': {
      await restoreSession(payload.id);
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

    case 'RECOVER_LAST': {
      const data = await chrome.storage.local.get(EMERGENCY_KEY);
      const snapshot = data[EMERGENCY_KEY];
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

    case 'SYNC_NOW': {
      const localSessions = await getAllSessions();
      const { status, merged } = await sync.sync(localSessions);
      // Persist anything the merge pulled down
      for (const session of Object.values(merged)) {
        await saveSession(session);
      }
      return { status };
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
}

chrome.runtime.onInstalled.addListener(bootstrap);
chrome.runtime.onStartup.addListener(bootstrap);
