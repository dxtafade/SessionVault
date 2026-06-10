/**
 * Full-page app ↔ Core Engine adapter.
 *
 * The UI never calls chrome.runtime.sendMessage directly — it calls the
 * functions here. Two modes, auto-detected:
 *   real — loaded as an extension page → forwards to the Core Engine.
 *   mock — opened as a plain file/preview → in-memory backend on localStorage,
 *          so the desk is fully clickable without the extension installed.
 */

const FORCE_MOCK = false;

const isExtension =
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  typeof chrome.runtime.sendMessage === 'function' &&
  chrome.runtime.id;

export const USING_MOCK = FORCE_MOCK || !isExtension;

// ─── Real backend ───────────────────────────────────────────────────────────────

async function sendReal(action, payload = {}) {
  const res = await chrome.runtime.sendMessage({ action, payload });
  if (res && res.error) throw new Error(res.error);
  return res ?? {};
}

// ─── Mock backend (preview only) ──────────────────────────────────────────────────

const MOCK_KEY = 'sv_app_mock';

function seed() {
  const now = Date.now();
  const tab = (title, url) => ({ url, title, favIconUrl: '', pinned: false, index: 0 });
  const sess = (id, name, folderId, ago, tabs) => ({
    id, name, folderId, createdAt: now - ago, updatedAt: now - ago, isAuto: false, tabs,
  });
  return {
    folders: {
      work: { id: 'work', name: 'Work', color: '#2D9D78', createdAt: now, updatedAt: now },
      life: { id: 'life', name: 'Life', color: '#E8744F', createdAt: now, updatedAt: now },
      someday: { id: 'someday', name: 'Someday', color: '#7B6CF6', createdAt: now, updatedAt: now },
    },
    sessions: {
      s1: sess('s1', 'Q3 research', 'work', 1728e5, [
        tab('Browser extension market size 2026', 'https://statista.com/extensions'),
        tab('Manifest V3 migration notes', 'https://developer.chrome.com/docs/extensions/mv3'),
        tab('OneTab review threads', 'https://news.ycombinator.com/item?id=1'),
        tab('Tab hoarding: a study', 'https://nngroup.com/articles/tabs'),
        tab('Session Buddy postmortem', 'https://medium.com/@x/session-buddy'),
        tab('Survey results — 412 responses', 'https://docs.google.com/forms/d/1'),
      ]),
      s2: sess('s2', 'Design inspiration', 'work', 864e5, [
        tab('Brutalist web design', 'https://brutalistwebsites.com'),
        tab('Variable fonts playground', 'https://v-fonts.com'),
        tab('The Shape of Design', 'https://shapeofdesignbook.com'),
        tab('Are.na / spatial interfaces', 'https://are.na/channel/spatial'),
      ]),
      s3: sess('s3', 'Apartment hunt', 'life', 72e5, [
        tab('2BR loft — Mission District', 'https://craigslist.org/apa/1'),
        tab('Sunny studio near Dolores Park', 'https://zillow.com/homedetails/2'),
        tab('How much rent can I afford?', 'https://reddit.com/r/personalfinance'),
        tab('Tenant rights checklist 2026', 'https://sf.gov/tenant-rights'),
      ]),
      s4: sess('s4', 'Trip to Lisbon', 'life', 6048e5, [
        tab('TAP flights Oct 12–19', 'https://flytap.com'),
        tab('Alfama walking route', 'https://maps.google.com/lisbon'),
        tab('Pastéis de nata ranking', 'https://eater.com/lisbon'),
      ]),
    },
    trash: {},
    settings: { autosaveEnabled: true, autosaveInterval: 10, maxAutoSessions: 5 },
  };
}

function load() {
  try { const raw = localStorage.getItem(MOCK_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  const s = seed(); save(s); return s;
}
function save(s) { try { localStorage.setItem(MOCK_KEY, JSON.stringify(s)); } catch (e) {} }
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Mirrors storage/crypto.js assessPassphrase so the preview indicator matches.
function mockAssess(passphrase) {
  const pass = String(passphrase ?? ''); const len = pass.length;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pass)).length;
  let score = 0;
  if (len >= 8) score++; if (len >= 12) score++; if (classes >= 2) score++; if (classes >= 3 && len >= 10) score++;
  const warnings = [];
  if (len < 8) warnings.push('Use at least 8 characters');
  if (classes < 2) warnings.push('Mix letters, numbers, and symbols');
  return { score, label: ['very weak', 'weak', 'fair', 'good', 'strong'][score], acceptable: score >= 2, warnings };
}

async function sendMock(action, payload = {}) {
  const db = load();
  const now = Date.now();
  switch (action) {
    case 'GET_SESSIONS': return { sessions: db.sessions };
    case 'GET_FOLDERS': return { folders: db.folders };
    case 'GET_TRASH': return { trash: db.trash };
    case 'GET_SETTINGS': return { settings: db.settings };
    case 'GET_STORAGE_STATS': {
      const list = Object.values(db.sessions);
      return { stats: { sessions: { total: list.length, auto: 0, manual: list.length, locked: 0 },
        totalTabs: list.reduce((n, s) => n + s.tabs.length, 0), trashCount: Object.keys(db.trash).length,
        usage: { used: 0, quota: 10485760, percent: 0 } } };
    }
    case 'SAVE_SESSION': {
      const id = genId();
      const s = { id, name: payload.name || 'Open tabs', folderId: payload.folderId ?? null,
        createdAt: now, updatedAt: now, isAuto: false,
        tabs: [{ url: 'https://example.com', title: 'Current tab', favIconUrl: '', pinned: false, index: 0 }] };
      db.sessions[id] = s; save(db); return { session: s };
    }
    case 'RESTORE_SESSION': case 'RESTORE_TAB': return { ok: true };
    case 'DELETE_SESSION': {
      const s = db.sessions[payload.id];
      if (s) { db.trash[payload.id] = { ...s, trashedAt: now }; delete db.sessions[payload.id]; save(db); }
      return { ok: true };
    }
    case 'RESTORE_FROM_TRASH': {
      const e = db.trash[payload.id];
      if (e) { const { trashedAt, ...s } = e; db.sessions[payload.id] = s; delete db.trash[payload.id]; save(db); return { session: s }; }
      return { session: null };
    }
    case 'EMPTY_TRASH': db.trash = {}; save(db); return { ok: true };
    case 'CREATE_FOLDER': {
      const id = genId();
      const f = { id, name: payload.name, color: payload.color ?? null, createdAt: now, updatedAt: now };
      db.folders[id] = f; save(db); return { folder: f };
    }
    case 'MOVE_SESSION_TO_FOLDER': {
      const s = db.sessions[payload.id];
      if (s) { s.folderId = payload.folderId ?? null; s.updatedAt = now; save(db); }
      return { session: s };
    }
    case 'UPDATE_SETTINGS': db.settings = { ...db.settings, ...payload }; save(db); return { settings: db.settings };
    case 'EXPORT_SESSION_TEXT': {
      const s = db.sessions[payload.id];
      return { text: s ? s.tabs.map((t) => t.url).join('\n') : '' };
    }
    case 'GET_SYNC_STATUS': return { status: db.sync || { enabled: false, state: 'disabled', lastSync: null, error: null, email: null } };
    case 'SET_SYNC_ENABLED': {
      if (payload.enabled) {
        const email = payload.credentials?.email || 'you@example.com';
        db.sync = { enabled: true, state: 'idle', lastSync: null, error: null, email };
      } else { db.sync = { enabled: false, state: 'disabled', lastSync: null, error: null, email: null }; }
      save(db); return { status: db.sync };
    }
    case 'SYNC_NOW': {
      if (!db.sync?.enabled) return { status: db.sync };
      if (!payload.passphrase) { db.sync = { ...db.sync, state: 'error', error: 'Passphrase required for sync' }; save(db); return { status: db.sync }; }
      db.sync = { ...db.sync, state: 'idle', lastSync: now, error: null }; save(db); return { status: db.sync };
    }
    case 'ASSESS_PASSPHRASE': return { assessment: mockAssess(payload.passphrase) };
    default: throw new Error(`Unknown action: ${action}`);
  }
}

const send = USING_MOCK ? sendMock : sendReal;

// ─── Public API ───────────────────────────────────────────────────────────────────

export const getSessions = async () => (await send('GET_SESSIONS')).sessions ?? {};
export const getFolders = async () => (await send('GET_FOLDERS')).folders ?? {};
export const getTrash = async () => (await send('GET_TRASH')).trash ?? {};
export const getSettings = async () => (await send('GET_SETTINGS')).settings ?? {};
export const getStats = async () => (await send('GET_STORAGE_STATS')).stats ?? null;

export const saveSession = async (name, folderId) => (await send('SAVE_SESSION', { name, folderId })).session;
export const restoreSession = (id) => send('RESTORE_SESSION', { id });
export const restoreTab = (url) => send('RESTORE_TAB', { url });
export const deleteSession = (id) => send('DELETE_SESSION', { id });
export const restoreFromTrash = (id) => send('RESTORE_FROM_TRASH', { id });
export const emptyTrash = () => send('EMPTY_TRASH');
export const createFolder = async (name, color) => (await send('CREATE_FOLDER', { name, color })).folder;
export const moveSessionToFolder = (id, folderId) => send('MOVE_SESSION_TO_FOLDER', { id, folderId });
export const updateSettings = async (partial) => (await send('UPDATE_SETTINGS', partial)).settings;
export const exportSessionText = async (id) => (await send('EXPORT_SESSION_TEXT', { id })).text ?? '';

// ── Cloud sync (Pro) ──
export const getSyncStatus = async () => (await send('GET_SYNC_STATUS')).status ?? null;
export const setSyncEnabled = async (enabled, credentials) => (await send('SET_SYNC_ENABLED', { enabled, credentials })).status ?? null;
export const syncNow = async (passphrase) => (await send('SYNC_NOW', { passphrase })).status ?? null;
export const assessPassphrase = async (passphrase) => (await send('ASSESS_PASSPHRASE', { passphrase })).assessment ?? null;
