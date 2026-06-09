/**
 * UI ↔ Backend adapter — owned by the UI developer.
 *
 * The UI NEVER calls chrome.runtime.sendMessage directly. It calls the
 * functions exported here. This is the single seam between UI and Core Engine.
 *
 *   Real mode:  running as a loaded extension → forwards to the Core Engine
 *               via chrome.runtime.sendMessage (the contract in README.md).
 *   Mock mode:  popup.html opened as a plain page (dev/preview) → an in-memory
 *               backend backed by localStorage, so the UI is fully clickable
 *               before the engine is finished.
 *
 * The mode is detected automatically: a real extension has chrome.runtime.id.
 * Set FORCE_MOCK = true to test the mock while loaded as an extension.
 */

const FORCE_MOCK = false;

const isExtension =
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  typeof chrome.runtime.sendMessage === 'function' &&
  chrome.runtime.id;

export const USING_MOCK = FORCE_MOCK || !isExtension;

// ─── Real backend (Core Engine via messages) ──────────────────────────────────

async function sendReal(action, payload = {}) {
  const res = await chrome.runtime.sendMessage({ action, payload });
  if (res && res.error) throw new Error(res.error);
  return res ?? {};
}

// ─── Mock backend (dev only) ───────────────────────────────────────────────────

const MOCK_KEY = 'sv_mock_state';

const DEFAULT_SETTINGS = {
  autosaveEnabled: true,
  autosaveInterval: 10,
  maxAutoSessions: 5,
};

function mockLoad() {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Seed with a couple of example sessions on first run.
  const now = Date.now();
  const seed = {
    sessions: {
      's1': {
        id: 's1', name: 'Work — research', createdAt: now - 3600_000,
        updatedAt: now - 3600_000, isAuto: false,
        tabs: [
          { url: 'https://github.com/dxtafade/SessionVault', title: 'SessionVault — GitHub', favIconUrl: '', pinned: true, index: 0 },
          { url: 'https://developer.chrome.com/docs/extensions', title: 'Chrome Extensions docs', favIconUrl: '', pinned: false, index: 1 },
          { url: 'https://news.ycombinator.com', title: 'Hacker News', favIconUrl: '', pinned: false, index: 2 },
        ],
      },
      's2': {
        id: 's2', name: 'Autosave — yesterday', createdAt: now - 86_400_000,
        updatedAt: now - 86_400_000, isAuto: true,
        tabs: [
          { url: 'https://example.com', title: 'Example Domain', favIconUrl: '', pinned: false, index: 0 },
        ],
      },
    },
    settings: { ...DEFAULT_SETTINGS },
  };
  mockSave(seed);
  return seed;
}

function mockSave(state) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(state));
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function sendMock(action, payload = {}) {
  const state = mockLoad();
  switch (action) {
    case 'GET_SESSIONS':
      return { sessions: state.sessions };
    case 'SAVE_SESSION': {
      const now = Date.now();
      const session = {
        id: genId(),
        name: payload.name || 'Unnamed session',
        createdAt: now, updatedAt: now, isAuto: false,
        // In real mode the engine captures live tabs; mock fabricates one.
        tabs: [{ url: 'about:blank', title: 'Current tab', favIconUrl: '', pinned: false, index: 0 }],
      };
      state.sessions[session.id] = session;
      mockSave(state);
      return { session };
    }
    case 'RESTORE_SESSION':
      return { ok: true };
    case 'DELETE_SESSION':
      delete state.sessions[payload.id];
      mockSave(state);
      return { ok: true };
    case 'GET_SETTINGS':
      return { settings: { ...DEFAULT_SETTINGS, ...state.settings } };
    case 'UPDATE_SETTINGS':
      state.settings = { ...DEFAULT_SETTINGS, ...state.settings, ...payload };
      mockSave(state);
      return { settings: state.settings };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

const send = USING_MOCK ? sendMock : sendReal;

// ─── Public API (this is all the UI imports) ───────────────────────────────────

export async function getSessions() {
  const { sessions = {} } = await send('GET_SESSIONS');
  return sessions;
}

export async function saveSession(name) {
  const { session } = await send('SAVE_SESSION', { name });
  return session;
}

export async function restoreSession(id) {
  await send('RESTORE_SESSION', { id });
}

export async function deleteSession(id) {
  await send('DELETE_SESSION', { id });
}

export async function getSettings() {
  const { settings } = await send('GET_SETTINGS');
  return settings;
}

export async function updateSettings(partial) {
  const { settings } = await send('UPDATE_SETTINGS', partial);
  return settings;
}
