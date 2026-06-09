/**
 * Storage Layer
 *
 * Responsibility: all read/write operations to chrome.storage.
 * Called by the Core Engine and UI — never calls them directly.
 *
 * Data schema:
 *   sessions: { [id: string]: Session }
 *   settings: Settings
 *
 * Session shape:
 * {
 *   id: string,          // uuid
 *   name: string,
 *   createdAt: number,   // unix ms
 *   updatedAt: number,
 *   tabs: Tab[],
 *   isAuto: boolean      // true = created by autosave
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
 *   maxAutoSessions: number    // how many autosave snapshots to keep
 * }
 */

const DEFAULT_SETTINGS = {
  autosaveEnabled: true,
  autosaveInterval: 10,
  maxAutoSessions: 5,
};

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getAllSessions() {
  const { sessions = {} } = await chrome.storage.local.get('sessions');
  return sessions;
}

export async function getSession(id) {
  const sessions = await getAllSessions();
  return sessions[id] ?? null;
}

export async function saveSession(session) {
  const sessions = await getAllSessions();
  sessions[session.id] = session;
  await chrome.storage.local.set({ sessions });
}

export async function deleteSession(id) {
  const sessions = await getAllSessions();
  delete sessions[id];
  await chrome.storage.local.set({ sessions });
}

export async function clearAllSessions() {
  await chrome.storage.local.set({ sessions: {} });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSettings() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function updateSettings(partial) {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...partial } });
}
