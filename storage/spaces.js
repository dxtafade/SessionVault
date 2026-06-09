/**
 * Project spaces — top-level workspaces (Pro).
 *
 * A space is the highest grouping level: `Space > Folder > Session`. Sessions
 * and folders point at a space via `spaceId` (null/absent = no space). Like
 * basic folders, assignment is a stored pointer — deleting a space never
 * deletes its contents, it just unassigns them.
 *
 * Stored under chrome.storage key `spaces` = { [id]: Space }.
 * Space { id, name, color?, icon?, createdAt, updatedAt }
 */

import { getAllSessions, getFolders } from './storage.js';

const KEY = 'spaces';

function _id() {
  return `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

export async function getSpaces() {
  const { [KEY]: spaces = {} } = await chrome.storage.local.get(KEY);
  return spaces;
}

export async function getSpace(id) {
  const all = await getSpaces();
  return all[id] ?? null;
}

export async function createSpace(name, { color = null, icon = null } = {}) {
  const all = await getSpaces();
  const now = Date.now();
  const space = { id: _id(), name, color, icon, createdAt: now, updatedAt: now };
  all[space.id] = space;
  await chrome.storage.local.set({ [KEY]: all });
  return space;
}

export async function updateSpace(id, partial = {}) {
  const all = await getSpaces();
  if (!all[id]) throw new Error(`Space ${id} not found`);
  all[id] = { ...all[id], ...partial, id, updatedAt: Date.now() };
  await chrome.storage.local.set({ [KEY]: all });
  return all[id];
}

/**
 * Deletes a space. Sessions and folders inside are reassigned to `reassignTo`
 * (default null = no space) so nothing is lost with the space.
 */
export async function deleteSpace(id, { reassignTo = null } = {}) {
  const all = await getSpaces();
  if (!all[id]) return;
  delete all[id];

  const sessions = await getAllSessions();
  for (const s of Object.values(sessions)) {
    if (s.spaceId === id) s.spaceId = reassignTo;
  }
  const folders = await getFolders();
  for (const f of Object.values(folders)) {
    if (f.spaceId === id) f.spaceId = reassignTo;
  }

  await chrome.storage.local.set({ [KEY]: all, sessions, folders });
}

// ─── Assignment ──────────────────────────────────────────────────────────────────

async function _assertSpaceExists(spaceId) {
  if (spaceId === null) return;
  const all = await getSpaces();
  if (!all[spaceId]) throw new Error(`Space ${spaceId} not found`);
}

export async function assignSessionToSpace(sessionId, spaceId) {
  await _assertSpaceExists(spaceId);
  const sessions = await getAllSessions();
  const session = sessions[sessionId];
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.spaceId = spaceId;
  session.updatedAt = Date.now();
  await chrome.storage.local.set({ sessions });
  return session;
}

export async function assignFolderToSpace(folderId, spaceId) {
  await _assertSpaceExists(spaceId);
  const folders = await getFolders();
  const folder = folders[folderId];
  if (!folder) throw new Error(`Folder ${folderId} not found`);
  folder.spaceId = spaceId;
  folder.updatedAt = Date.now();
  await chrome.storage.local.set({ folders });
  return folder;
}

// ─── Queries ───────────────────────────────────────────────────────────────────

/** Sessions in a space (spaceId = null returns unassigned), newest-first. */
export async function getSessionsInSpace(spaceId) {
  const sessions = Object.values(await getAllSessions());
  return sessions
    .filter(s => (s.spaceId ?? null) === spaceId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Folders in a space (spaceId = null returns unassigned). */
export async function getFoldersInSpace(spaceId) {
  const folders = Object.values(await getFolders());
  return folders.filter(f => (f.spaceId ?? null) === spaceId);
}

/** { [spaceId]: { folders, sessions } } member counts for badges. */
export async function getSpaceCounts() {
  const [spaces, sessions, folders] = await Promise.all([
    getSpaces(),
    getAllSessions(),
    getFolders(),
  ]);
  const sList = Object.values(sessions);
  const fList = Object.values(folders);
  const out = {};
  for (const sp of Object.values(spaces)) {
    out[sp.id] = {
      folders: fList.filter(f => f.spaceId === sp.id).length,
      sessions: sList.filter(s => s.spaceId === sp.id).length,
    };
  }
  return out;
}
