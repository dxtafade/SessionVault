/**
 * Storage Layer
 *
 * Responsibility: all read/write to chrome.storage.
 * Called by the Core Engine and UI — never calls them directly.
 *
 * Storage schema version: 2
 *
 * Session shape:
 * {
 *   id: string,          // uuid
 *   name: string,
 *   createdAt: number,   // unix ms
 *   updatedAt: number,
 *   tabs: Tab[],
 *   isAuto: boolean,
 *   locked?: boolean,
 *   folderId?: string | null,   // smart folders / project spaces
 *   tags?: string[]             // free-form labels
 * }
 *
 * Tab shape:
 * { url, title, favIconUrl, pinned, index, windowIndex? }
 *
 * Folder shape (key `folders` = { [id]: Folder }):
 * { id, name, color?, createdAt, updatedAt }
 *
 * Archive entry (key `archive` = { [id]: ArchivedEntry }):
 * { id, name, createdAt, archivedAt, tabCount, data }  // data = base64(gzip(JSON(session)))
 *
 * Settings shape:
 * { autosaveEnabled, autosaveInterval (min), maxAutoSessions }
 */

import { compressToBase64, decompressFromBase64 } from './gzip.js';

const SCHEMA_VERSION = 2;

const DEFAULT_SETTINGS = {
  autosaveEnabled: true,
  autosaveInterval: 10,
  maxAutoSessions: 5,
};

// Trashed sessions older than this are purged by purgeExpiredTrash().
const TRASH_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const { _schemaVersion = 0 } = await _read('_schemaVersion');
  if (_schemaVersion === SCHEMA_VERSION) return;

  // v0 → v1: original skeleton, no transform needed.
  // v1 → v2: smart folders, tags, and archive added. The new fields are all
  //          optional and the new keys default to {} on read, so no data
  //          transform is required — just stamp the version.
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

// ─── Lock ─────────────────────────────────────────────────────────────────────

/**
 * Locked sessions are protected: trashSession() refuses to remove them
 * unless { force: true } is passed. Used to keep important sessions safe
 * from autosave pruning and accidental deletes.
 */
export async function lockSession(id) {
  const sessions = await getAllSessions();
  const session = sessions[id];
  if (!session) throw new Error(`Session ${id} not found`);
  session.locked = true;
  session.updatedAt = Date.now();
  await _write({ sessions });
  return session;
}

export async function unlockSession(id) {
  const sessions = await getAllSessions();
  const session = sessions[id];
  if (!session) throw new Error(`Session ${id} not found`);
  session.locked = false;
  session.updatedAt = Date.now();
  await _write({ sessions });
  return session;
}

// ─── Trash (soft delete) ────────────────────────────────────────────────────────
//
// Schema: chrome.storage.local key `trash` = { [id]: { ...session, trashedAt } }
// Sessions moved here instead of being deleted outright, so a user can undo.

export async function getTrash() {
  const { trash = {} } = await _read('trash');
  return trash;
}

/**
 * Moves a session out of the active set and into the trash.
 * Throws if the session is locked, unless { force: true }.
 * Returns the trashed entry.
 */
export async function trashSession(id, { force = false } = {}) {
  const sessions = await getAllSessions();
  const session = sessions[id];
  if (!session) throw new Error(`Session ${id} not found`);
  if (session.locked && !force) {
    throw new Error(`Session ${id} is locked — unlock it before deleting`);
  }

  const trash = await getTrash();
  trash[id] = { ...session, trashedAt: Date.now() };
  delete sessions[id];
  await _write({ sessions, trash });
  return trash[id];
}

/**
 * Moves a session back from the trash into the active set.
 * Strips the trashedAt marker. Returns the restored session.
 */
export async function restoreFromTrash(id) {
  const trash = await getTrash();
  const entry = trash[id];
  if (!entry) throw new Error(`Trashed session ${id} not found`);

  const { trashedAt, ...session } = entry;
  const sessions = await getAllSessions();
  sessions[id] = session;
  delete trash[id];
  await _write({ sessions, trash });
  return session;
}

/** Permanently removes a single trashed session. */
export async function deleteFromTrash(id) {
  const trash = await getTrash();
  delete trash[id];
  await _write({ trash });
}

/** Permanently removes everything in the trash. */
export async function emptyTrash() {
  await _write({ trash: {} });
}

/**
 * Permanently removes trashed sessions older than TRASH_TTL_DAYS.
 * Intended to be called by the Core Engine on a schedule / startup.
 * Returns the number of sessions purged.
 */
export async function purgeExpiredTrash(ttlDays = TRASH_TTL_DAYS) {
  const trash = await getTrash();
  const cutoff = Date.now() - ttlDays * DAY_MS;
  let purged = 0;

  for (const [id, entry] of Object.entries(trash)) {
    if (entry.trashedAt < cutoff) {
      delete trash[id];
      purged++;
    }
  }

  if (purged > 0) await _write({ trash });
  return purged;
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
 * Returns a single session's tabs as a newline-separated URL list,
 * for users who want to copy/paste tabs as plain text.
 */
export async function exportSessionAsText(id) {
  const session = await getSession(id);
  if (!session) throw new Error(`Session ${id} not found`);
  return session.tabs.map(t => t.url).join('\n');
}

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

/**
 * Aggregate stats for a future UI dashboard. Combines session/tab/trash
 * counts with raw byte usage in a single round-trip-friendly shape:
 *
 * {
 *   sessions: { total, auto, manual, locked },
 *   totalTabs: number,
 *   trashCount: number,
 *   archivedCount: number,
 *   folderCount: number,
 *   usage: { used, quota, percent }
 * }
 */
export async function getStorageStats() {
  const [sessionsMap, trash, archive, folders, usage] = await Promise.all([
    getAllSessions(),
    getTrash(),
    getArchive(),
    getFolders(),
    getStorageUsage(),
  ]);

  const sessions = Object.values(sessionsMap);
  const auto = sessions.filter(s => s.isAuto).length;
  const locked = sessions.filter(s => s.locked).length;
  const totalTabs = sessions.reduce((sum, s) => sum + s.tabs.length, 0);

  return {
    sessions: {
      total: sessions.length,
      auto,
      manual: sessions.length - auto,
      locked,
    },
    totalTabs,
    trashCount: Object.keys(trash).length,
    archivedCount: Object.keys(archive).length,
    folderCount: Object.keys(folders).length,
    usage,
  };
}

// ─── Smart folders / project spaces ──────────────────────────────────────────────
//
// Folders are named containers; a session points at one via `folderId`
// (null/absent = unfiled). Stored under key `folders` = { [id]: Folder }.

function _folderId() {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getFolders() {
  const { folders = {} } = await _read('folders');
  return folders;
}

export async function getFolder(id) {
  const folders = await getFolders();
  return folders[id] ?? null;
}

export async function createFolder(name, { color = null } = {}) {
  const folders = await getFolders();
  const now = Date.now();
  const folder = { id: _folderId(), name, color, createdAt: now, updatedAt: now };
  folders[folder.id] = folder;
  await _write({ folders });
  return folder;
}

export async function renameFolder(id, name) {
  const folders = await getFolders();
  if (!folders[id]) throw new Error(`Folder ${id} not found`);
  folders[id] = { ...folders[id], name, updatedAt: Date.now() };
  await _write({ folders });
  return folders[id];
}

/**
 * Deletes a folder. Any sessions inside are reassigned to `reassignTo`
 * (default null = unfiled) so sessions are never lost with the folder.
 */
export async function deleteFolder(id, { reassignTo = null } = {}) {
  const folders = await getFolders();
  if (!folders[id]) return;
  delete folders[id];

  const sessions = await getAllSessions();
  for (const s of Object.values(sessions)) {
    if (s.folderId === id) s.folderId = reassignTo;
  }
  await _write({ folders, sessions });
}

/** Sets (or clears, with null) a session's folder. */
export async function assignSessionToFolder(sessionId, folderId) {
  const sessions = await getAllSessions();
  const session = sessions[sessionId];
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (folderId !== null) {
    const folders = await getFolders();
    if (!folders[folderId]) throw new Error(`Folder ${folderId} not found`);
  }
  session.folderId = folderId;
  session.updatedAt = Date.now();
  await _write({ sessions });
  return session;
}

/** Sessions in a folder (folderId = null returns unfiled), newest-first. */
export async function getSessionsInFolder(folderId) {
  const sessions = Object.values(await getAllSessions());
  return sessions
    .filter(s => (s.folderId ?? null) === folderId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function addTag(sessionId, tag) {
  const clean = String(tag).trim().toLowerCase();
  if (!clean) throw new Error('Tag cannot be empty');
  const sessions = await getAllSessions();
  const session = sessions[sessionId];
  if (!session) throw new Error(`Session ${sessionId} not found`);
  const tags = new Set(session.tags ?? []);
  tags.add(clean);
  session.tags = [...tags];
  session.updatedAt = Date.now();
  await _write({ sessions });
  return session;
}

export async function removeTag(sessionId, tag) {
  const clean = String(tag).trim().toLowerCase();
  const sessions = await getAllSessions();
  const session = sessions[sessionId];
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.tags = (session.tags ?? []).filter(t => t !== clean);
  session.updatedAt = Date.now();
  await _write({ sessions });
  return session;
}

/** All distinct tags across sessions, sorted alphabetically. */
export async function getAllTags() {
  const sessions = Object.values(await getAllSessions());
  const tags = new Set();
  for (const s of sessions) for (const t of s.tags ?? []) tags.add(t);
  return [...tags].sort();
}

/** Sessions carrying a given tag, newest-first. */
export async function getSessionsByTag(tag) {
  const clean = String(tag).trim().toLowerCase();
  const sessions = Object.values(await getAllSessions());
  return sessions
    .filter(s => (s.tags ?? []).includes(clean))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Long history / archive ───────────────────────────────────────────────────────
//
// Archived sessions move OUT of the hot `sessions` map into `archive`, where
// each session's payload is gzipped + base64'd to keep long histories well
// under the chrome.storage quota. Listing stays cheap (metadata is plain);
// only restore pays the decompress cost.

export async function getArchive() {
  const { archive = {} } = await _read('archive');
  return archive;
}

/** Lightweight metadata for every archived session, newest-first. No payloads. */
export async function listArchived() {
  const archive = await getArchive();
  return Object.values(archive)
    .map(({ id, name, createdAt, archivedAt, tabCount }) => ({
      id, name, createdAt, archivedAt, tabCount,
    }))
    .sort((a, b) => b.archivedAt - a.archivedAt);
}

/** Moves a session from the active set into the compressed archive. */
export async function archiveSession(id) {
  const sessions = await getAllSessions();
  const session = sessions[id];
  if (!session) throw new Error(`Session ${id} not found`);

  const archive = await getArchive();
  archive[id] = {
    id,
    name: session.name,
    createdAt: session.createdAt,
    archivedAt: Date.now(),
    tabCount: session.tabs.length,
    data: await compressToBase64(JSON.stringify(session)),
  };
  delete sessions[id];
  await _write({ sessions, archive });
  return archive[id];
}

/** Decompresses an archived session back into the active set. */
export async function restoreArchived(id) {
  const archive = await getArchive();
  const entry = archive[id];
  if (!entry) throw new Error(`Archived session ${id} not found`);

  const session = JSON.parse(await decompressFromBase64(entry.data));
  const sessions = await getAllSessions();
  sessions[id] = session;
  delete archive[id];
  await _write({ sessions, archive });
  return session;
}

/** Permanently removes an archived session. */
export async function deleteArchived(id) {
  const archive = await getArchive();
  delete archive[id];
  await _write({ archive });
}

/**
 * Archives active sessions older than `olderThanDays`, keeping the
 * `keepRecent` newest untouched regardless of age. Locked sessions are
 * never auto-archived. Returns the number archived. Intended for the
 * Core Engine to call on a schedule to bound the hot set.
 */
export async function autoArchiveOldSessions({ olderThanDays = 30, keepRecent = 50 } = {}) {
  const cutoff = Date.now() - olderThanDays * DAY_MS;
  const sessions = Object.values(await getAllSessions())
    .sort((a, b) => b.createdAt - a.createdAt);

  const candidates = sessions
    .slice(keepRecent)
    .filter(s => !s.locked && s.createdAt < cutoff);

  for (const s of candidates) await archiveSession(s.id);
  return candidates.length;
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
