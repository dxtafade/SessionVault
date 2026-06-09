/**
 * Storage Layer
 *
 * Responsibility: all read/write to chrome.storage.
 * Called by the Core Engine and UI — never calls them directly.
 *
 * Storage schema version: 1
 *
 * Session shape:
 * {
 *   id: string,          // uuid
 *   name: string,
 *   createdAt: number,   // unix ms
 *   updatedAt: number,
 *   tabs: Tab[],
 *   isAuto: boolean
 * }
 *
 * Tab shape:
 * {
 *   url: string,
 *   title: string,
 *   favIconUrl: string,
 *   pinned: boolean,
 *   index: number
 * }
 *
 * Settings shape:
 * {
 *   autosaveEnabled: boolean,
 *   autosaveInterval: number,  // minutes
 *   maxAutoSessions: number
 * }
 */

const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = {
  autosaveEnabled: true,
  autosaveInterval: 10,
  maxAutoSessions: 5,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _read(keys) {
  return chrome.storage.local.get(keys);
}

async function _write(data) {
  return chrome.storage.local.set(data);
}

// ─── Schema migration ─────────────────────────────────────────────────────────

/**
 * Run on extension install/update. Stamps schema version so future
 * migrations know where to start.
 */
export async function migrateIfNeeded() {
  const { _schemaVersion } = await _read('_schemaVersion');
  if (_schemaVersion === SCHEMA_VERSION) return;

  // v0 → v1: nothing to transform, just stamp the version
  await _write({ _schemaVersion: SCHEMA_VERSION });
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getAllSessions() {
  const { sessions = {} } = await _read('sessions');
  return sessions;
}

export async function getSession(id) {
  const sessions = await getAllSessions();
  return sessions[id] ?? null;
}

export async function saveSession(session) {
  const sessions = await getAllSessions();
  sessions[session.id] = session;
  await _write({ sessions });
}

export async function deleteSession(id) {
  const sessions = await getAllSessions();
  delete sessions[id];
  await _write({ sessions });
}

export async function clearAllSessions() {
  await _write({ sessions: {} });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  const { settings = {} } = await _read('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function updateSettings(partial) {
  const current = await getSettings();
  await _write({ settings: { ...current, ...partial } });
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Returns sessions whose name or any tab title/URL contains the query
 * (case-insensitive). Returns array sorted newest-first.
 */
export async function searchSessions(query) {
  const sessions = await getAllSessions();
  const q = query.trim().toLowerCase();
  if (!q) return Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);

  return Object.values(sessions)
    .filter(session => {
      if (session.name.toLowerCase().includes(q)) return true;
      return session.tabs.some(
        t =>
          t.title.toLowerCase().includes(q) ||
          t.url.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Removes duplicate URLs within a session's tab list.
 * Keeps the first occurrence (lowest index). Mutates nothing — returns
 * a new session object.
 */
export function deduplicateTabs(session) {
  const seen = new Set();
  const tabs = session.tabs.filter(tab => {
    if (seen.has(tab.url)) return false;
    seen.add(tab.url);
    return true;
  });
  return { ...session, tabs };
}

/**
 * Finds sessions with identical tab sets (same URLs, order-independent).
 * Returns an array of duplicate groups; each group is an array of session ids.
 */
export async function findDuplicateSessions() {
  const sessions = Object.values(await getAllSessions());

  const fingerprint = s =>
    [...s.tabs.map(t => t.url)].sort().join('\n');

  const groups = new Map();
  for (const s of sessions) {
    const key = fingerprint(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s.id);
  }

  return [...groups.values()].filter(g => g.length > 1);
}

// ─── Export / Import ──────────────────────────────────────────────────────────

/**
 * Serialises all sessions + settings to a plain JS object ready to be
 * JSON.stringify-ed or handed to the File API for download.
 */
export async function exportData() {
  const [sessions, settings] = await Promise.all([getAllSessions(), getSettings()]);
  return {
    _exportedAt: Date.now(),
    _schemaVersion: SCHEMA_VERSION,
    sessions,
    settings,
  };
}

/**
 * Merges an imported data blob into local storage.
 * mode:
 *   'merge'   — keeps existing sessions, adds/overwrites from import (default)
 *   'replace' — clears sessions first, then imports
 *
 * Returns { imported: number, skipped: number }.
 */
export async function importData(blob, mode = 'merge') {
  if (!blob || typeof blob !== 'object') throw new Error('Invalid import file');
  if (!blob.sessions || typeof blob.sessions !== 'object')
    throw new Error('Import file has no sessions');

  const incoming = blob.sessions;
  const existing = mode === 'replace' ? {} : await getAllSessions();

  let imported = 0;
  let skipped = 0;

  for (const [id, session] of Object.entries(incoming)) {
    if (!isValidSession(session)) { skipped++; continue; }
    existing[id] = session;
    imported++;
  }

  await _write({ sessions: existing });

  if (blob.settings && mode === 'replace') {
    await _write({ settings: blob.settings });
  }

  return { imported, skipped };
}

// ─── Storage quota ────────────────────────────────────────────────────────────

/**
 * Returns { used, quota, percent } in bytes.
 * chrome.storage.local.QUOTA_BYTES is 10 MB by default.
 */
export async function getStorageUsage() {
  const used = await chrome.storage.local.getBytesInUse(null);
  const quota = chrome.storage.local.QUOTA_BYTES ?? 10_485_760; // 10 MB fallback
  return { used, quota, percent: Math.round((used / quota) * 100) };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidSession(s) {
  return (
    s &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.createdAt === 'number' &&
    Array.isArray(s.tabs)
  );
}
