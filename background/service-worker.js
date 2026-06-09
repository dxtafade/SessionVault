/**
 * Core Engine — service worker
 *
 * Responsibility: browser event handling, session logic, autosave scheduler.
 * Talks to Storage via storage.js and exposes a message API for the UI.
 *
 * Message API (chrome.runtime.sendMessage / popup → engine):
 *   { action: 'SAVE_SESSION',    payload: { name } }          → { session }
 *   { action: 'RESTORE_SESSION', payload: { id } }            → { ok }
 *   { action: 'DELETE_SESSION',  payload: { id } }            → { ok }
 *   { action: 'GET_SESSIONS' }                                 → { sessions }
 *   { action: 'GET_SETTINGS' }                                 → { settings }
 *   { action: 'UPDATE_SETTINGS', payload: { ...partial } }    → { settings }
 */

import {
  getAllSessions,
  saveSession,
  deleteSession,
  getSettings,
  updateSettings,
} from '../storage/storage.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function captureCurrentTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map(t => ({
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl ?? '',
    pinned: t.pinned,
    index: t.index,
  }));
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
  const sessions = await getAllSessions();
  const session = sessions[id];
  if (!session) throw new Error(`Session ${id} not found`);

  for (const tab of session.tabs) {
    await chrome.tabs.create({ url: tab.url, pinned: tab.pinned });
  }
}

async function pruneAutoSessions() {
  const settings = await getSettings();
  const sessions = await getAllSessions();
  const autoSessions = Object.values(sessions)
    .filter(s => s.isAuto)
    .sort((a, b) => b.createdAt - a.createdAt);

  const toDelete = autoSessions.slice(settings.maxAutoSessions);
  for (const s of toDelete) {
    await deleteSession(s.id);
  }
}

// ─── Autosave ─────────────────────────────────────────────────────────────────

const ALARM_NAME = 'autosave';

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

  const label = new Date().toLocaleString();
  await saveCurrentSession(`Autosave — ${label}`, true);
  await pruneAutoSessions();
});

// ─── Message API ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    console.error('[SessionVault] message error:', err);
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
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleAutosave();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAutosave();
});
