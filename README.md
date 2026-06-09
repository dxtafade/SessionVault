# Session Vault

> Never lose your tabs again.

Browser extension that saves, restores, and syncs your tab sessions.

## Team

| Area | Files |
|---|---|
| **Core Engine** | `background/service-worker.js` |
| **Storage** | `storage/storage.js` |
| **UI** | `popup/popup.html`, `popup/popup.js`, `popup/popup.css` |

## Message API (UI → Core Engine)

All communication goes through `chrome.runtime.sendMessage`.

```js
// Save the current tabs as a named session
// FREE PLAN: throws an error starting with 'FREE_LIMIT_REACHED' once the user
// has 50 saved sessions — catch it and show an upgrade/clean-up prompt.
const { session } = await chrome.runtime.sendMessage({
  action: 'SAVE_SESSION',
  payload: { name: 'Work — Monday' }
});

// List all saved sessions
const { sessions } = await chrome.runtime.sendMessage({ action: 'GET_SESSIONS' });
// sessions: { [id]: Session }

// Get a single session
const { session } = await chrome.runtime.sendMessage({
  action: 'GET_SESSION',
  payload: { id }
});

// Restore a session (opens all tabs, recreates original windows)
await chrome.runtime.sendMessage({ action: 'RESTORE_SESSION', payload: { id } });

// Delete a session — SOFT delete: moves it to the trash (undoable, purged
// after 30 days). Pass { id, force: true } to delete a locked session.
await chrome.runtime.sendMessage({ action: 'DELETE_SESSION', payload: { id } });

// Rename a session
const { session } = await chrome.runtime.sendMessage({
  action: 'RENAME_SESSION',
  payload: { id, name: 'New name' }
});

// Duplicate a session
const { session } = await chrome.runtime.sendMessage({
  action: 'DUPLICATE_SESSION',
  payload: { id, name: 'Optional custom name' }   // name is optional
});

// Recover from crash / emergency snapshot
// Returns the recovered session (or null if no snapshot exists)
const { session } = await chrome.runtime.sendMessage({
  action: 'RECOVER_LAST',
  payload: { name: 'Optional custom name' }        // name is optional
});

// Export all sessions as a JSON string (for download / backup)
const { json } = await chrome.runtime.sendMessage({ action: 'EXPORT_SESSIONS' });

// Import sessions from a JSON string (skips duplicates by id)
const { imported, skipped } = await chrome.runtime.sendMessage({
  action: 'IMPORT_SESSIONS',
  payload: { json }
});

// Read settings
const { settings } = await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });

// Update settings (partial update, only pass what you want to change)
await chrome.runtime.sendMessage({
  action: 'UPDATE_SETTINGS',
  payload: { autosaveEnabled: true, autosaveInterval: 15 }
});

// Search across session names + tab titles/urls (free tier)
// result item: { session, matchedTabs: Tab[], nameMatch: boolean }
const { results } = await chrome.runtime.sendMessage({
  action: 'SEARCH_SESSIONS',
  payload: { query: 'github' }
});

// ── Trash (soft delete) — DELETE_SESSION lands sessions here ──
const { trash } = await chrome.runtime.sendMessage({ action: 'GET_TRASH' });
//   trash: { [id]: Session & { trashedAt } }
await chrome.runtime.sendMessage({ action: 'RESTORE_FROM_TRASH', payload: { id } }); // → { session }
await chrome.runtime.sendMessage({ action: 'DELETE_FROM_TRASH',  payload: { id } }); // → { ok }   (permanent)
await chrome.runtime.sendMessage({ action: 'EMPTY_TRASH' });                          // → { ok }
// PURGE_TRASH runs automatically on startup; rarely needed manually.

// ── Lock (protect a session from delete / autosave pruning) ──
await chrome.runtime.sendMessage({ action: 'LOCK_SESSION',   payload: { id } }); // → { session }
await chrome.runtime.sendMessage({ action: 'UNLOCK_SESSION', payload: { id } }); // → { session }

// ── Misc ──
// Storage dashboard stats: { sessions: {total,auto,manual,locked}, totalTabs, trashCount, usage }
const { stats } = await chrome.runtime.sendMessage({ action: 'GET_STORAGE_STATS' });
// One session's tab urls as plain text (newline-joined)
const { text } = await chrome.runtime.sendMessage({ action: 'EXPORT_SESSION_TEXT', payload: { id } });

// ── Folders (free — basic manual organization; persisted by the storage layer) ──
// A session belongs to a folder via its `folderId` field (null = unfiled).
const { folders } = await chrome.runtime.sendMessage({ action: 'GET_FOLDERS' });
//   folders: { [id]: { id, name, color, createdAt, updatedAt } }
const { folder } = await chrome.runtime.sendMessage({ action: 'CREATE_FOLDER', payload: { name: 'Research', color: '#2563eb' } }); // color optional
await chrome.runtime.sendMessage({ action: 'RENAME_FOLDER', payload: { id, name: 'Reading list' } }); // → { folder }
await chrome.runtime.sendMessage({ action: 'DELETE_FOLDER', payload: { id } });   // → { ok }  (its sessions become unfiled, not deleted)
// Move a session into a folder (or out with folderId: null)
await chrome.runtime.sendMessage({ action: 'MOVE_SESSION_TO_FOLDER', payload: { id, folderId } }); // → { session }
// Sessions in a folder (folderId: null → unfiled), newest-first
const { sessions } = await chrome.runtime.sendMessage({ action: 'GET_SESSIONS_IN_FOLDER', payload: { folderId } });

// ── Deduplication (Pro) — throws 'PRO_REQUIRED: …' on free ──
// Remove duplicate-URL tabs within one session:
const { session, removed } = await chrome.runtime.sendMessage({ action: 'DEDUPLICATE_SESSION', payload: { id } });
// Find groups of sessions with identical tab sets:
const { groups } = await chrome.runtime.sendMessage({ action: 'FIND_DUPLICATE_SESSIONS' }); // groups: string[][] of session ids

// ── Entitlements (free vs Pro) — see docs/TIERS.md ──
// On open: show "N / 50" counter + Upgrade button; lock Autosave when !pro.
const { entitlements, limits } =
  await chrome.runtime.sendMessage({ action: 'GET_ENTITLEMENTS' });
// entitlements: { pro: boolean }   limits: { freeSessionLimit: 50 }

// Dev/stub toggle (no billing yet) — flip Pro to test the paid UI:
await chrome.runtime.sendMessage({ action: 'SET_PRO', payload: { pro: true } });

// ── Cloud sync (paid) — transport is stubbed for now, contract is stable ──

// status: { enabled, state: 'idle'|'syncing'|'error'|'disabled', lastSync, error }
const { status } = await chrome.runtime.sendMessage({ action: 'GET_SYNC_STATUS' });

await chrome.runtime.sendMessage({
  action: 'SET_SYNC_ENABLED',
  payload: { enabled: true, credentials: { /* TBD */ } }
});

// passphrase = end-to-end key, supplied per-sync, never persisted. See docs/CRYPTO_CONTRACT.md
await chrome.runtime.sendMessage({ action: 'SYNC_NOW', payload: { passphrase } });
```

## Data shapes

```ts
Session {
  id:          string
  name:        string
  createdAt:   number        // unix ms
  updatedAt:   number
  tabs:        Tab[]
  isAuto:      boolean       // true = created by autosave
  locked?:     boolean       // protected from delete / autosave pruning
  folderId?:   string | null // folder it's filed under (null = unfiled)
}

Folder {
  id:          string
  name:        string
  color:       string | null
  createdAt:   number
  updatedAt:   number
}

Tab {
  url:         string
  title:       string
  favIconUrl:  string
  pinned:      boolean
  index:       number        // position within its window
  windowIndex: number        // which window (0-based, by open order)
}

Settings {
  autosaveEnabled:  boolean
  autosaveInterval: number   // minutes between autosaves
  maxAutoSessions:  number   // how many autosave snapshots to keep
}
```

## Notes for UI developer

- `sessions` from `GET_SESSIONS` is a plain object keyed by id. Sort by `createdAt` descending for display.
- `isAuto: true` sessions are autosaves — you may want to show them differently (e.g. collapsed group or lighter style).
- `RECOVER_LAST` is the "did your browser just crash?" button. Show it prominently on first open or when the last session differs from the current tabs.
- All actions return `{ error: string }` on failure — always check for it.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder
