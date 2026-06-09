/**
 * Core Engine — service worker
 *
 * Responsibility: browser event handling, session logic, autosave scheduler.
 * Talks to Storage via storage.js and exposes a message API for the UI.
 *
 * Message API (chrome.runtime.sendMessage / popup → engine):
 *   { action: 'SAVE_SESSION',      payload: { name } }              → { session }
 *   { action: 'RESTORE_SESSION',   payload: { id } }                → { ok }
 *   { action: 'DELETE_SESSION',    payload: { id } }                → { ok }
 *   { action: 'RENAME_SESSION',    payload: { id, name } }          → { session }
 *   { action: 'DUPLICATE_SESSION', payload: { id, name? } }         → { session }
 *   { action: 'GET_SESSIONS' }                                       → { sessions }
 *   { action: 'GET_SESSION',       payload: { id } }                → { session }
 *   { action: 'GET_SETTINGS' }                                       → { settings }
 *   { action: 'UPDATE_SETTINGS',   payload: { ...partial } }        → { settings }
 *   { action: 'RECOVER_LAST',      payload: { name? } }             → { session | null }
 *   { action: 'EXPORT_SESSIONS' }                                    → { json }
 *   { action: 'IMPORT_SESSIONS',   payload: { json } }              → { imported, skipped }
 */

import {
  getAllSessions,
  getSession,
  saveSession,
  deleteSession,
  getSettings,
  updateSettings,
} from '../storage/storage.js';

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
    .filter(s => s.isAuto)
    .sort((a, b) => b.createdAt - a.createdAt);

  for (const s of autoSessions.slice(settings.maxAutoSessions)) {
    await deleteSession(s.id);
  }
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
      await deleteSession(payload.id);
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
      const sessions = await getAllSessions();
      const json = JSON.stringify({ version: 1, sessions }, null, 2);
      return { json };
    }

    case 'IMPORT_SESSIONS': {
      let parsed;
      try {
        parsed = JSON.parse(payload.json);
      } catch {
        throw new Error('Invalid JSON');
      }

      const incoming = parsed.sessions ?? {};
      const existing = await getAllSessions();
      let imported = 0;
      let skipped = 0;

      for (const [id, session] of Object.entries(incoming)) {
        if (existing[id]) {
          skipped++;
        } else {
          await saveSession({ ...session, id });
          imported++;
        }
      }

      return { imported, skipped };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleAutosave();
  await updateEmergencySnapshot();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAutosave();
  await updateEmergencySnapshot();
});
