# Session Vault

> Never lose your tabs again.

Browser extension that saves, restores, and syncs your tab sessions.

## Team

| Area | Files |
|---|---|
| **Core Engine** | `background/service-worker.js` |
| **Storage** | `storage/storage.js` |
| **UI** | `app/*` (full-page "Flip Desk"), `popup/*` (legacy popup) |

## Full-page UI — "The Flip Desk"

Clicking the toolbar icon opens a **full page** (`app/index.html`), not a popup:
the manifest `action` has no `default_popup`, so the service worker's
`chrome.action.onClicked` handler opens/focuses the app tab.

- `app/api.js` — adapter to the Core Engine (real `sendMessage` + a mock backend
  for previewing the page without the extension loaded).
- `app/app.js` / `app/app.css` — the Flip Desk: folder-tab rail, draggable
  session "stacks", click-to-deal-out tab cards, bin, search, settings.
- Folders = shelves (tabs across the top). Save/restore/delete/share/trash and
  settings are all wired to the message API below.

Preview it standalone (mock mode): `python3 -m http.server -d app 8123`.

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

// ── Tags (free) ──
await chrome.runtime.sendMessage({ action: 'ADD_TAG',    payload: { id, tag: 'work' } });   // → { session }
await chrome.runtime.sendMessage({ action: 'REMOVE_TAG', payload: { id, tag: 'work' } });   // → { session }
const { tags }     = await chrome.runtime.sendMessage({ action: 'GET_ALL_TAGS' });           // string[], sorted
const { sessions } = await chrome.runtime.sendMessage({ action: 'GET_SESSIONS_BY_TAG', payload: { tag: 'work' } });

// ── Smart folders (Pro) — dynamic, rule-driven membership ──
// rules schema: { match: 'all'|'any', conditions: [{ field, op, value }] }  (see storage/smart-folders.js)
const { smartFolders } = await chrome.runtime.sendMessage({ action: 'GET_SMART_FOLDERS' });
const { smartFolder } = await chrome.runtime.sendMessage({ action: 'CREATE_SMART_FOLDER',
  payload: { name: 'GitHub', rules: { match: 'any', conditions: [{ field: 'url', op: 'contains', value: 'github.com' }] } } });
await chrome.runtime.sendMessage({ action: 'UPDATE_SMART_FOLDER', payload: { id, name: 'GH' } }); // → { smartFolder }
await chrome.runtime.sendMessage({ action: 'DELETE_SMART_FOLDER', payload: { id } });             // → { ok }
const { sessions: members } = await chrome.runtime.sendMessage({ action: 'EVALUATE_SMART_FOLDER', payload: { id } });
const { sessions: preview } = await chrome.runtime.sendMessage({ action: 'PREVIEW_RULES', payload: { rules } }); // live preview
const { counts } = await chrome.runtime.sendMessage({ action: 'GET_SMART_FOLDER_COUNTS' });       // { [id]: number }

// ── Spaces (Pro) — top-level workspaces: Space > Folder > Session ──
const { spaces } = await chrome.runtime.sendMessage({ action: 'GET_SPACES' });
const { space }  = await chrome.runtime.sendMessage({ action: 'CREATE_SPACE', payload: { name: 'Client X', color: '#16a34a', icon: '📁' } });
await chrome.runtime.sendMessage({ action: 'UPDATE_SPACE', payload: { id, name: 'Client Y' } });   // → { space }
await chrome.runtime.sendMessage({ action: 'DELETE_SPACE', payload: { id } });                      // → { ok } (contents unassigned, not deleted)
await chrome.runtime.sendMessage({ action: 'ASSIGN_SESSION_TO_SPACE', payload: { id, spaceId } });  // → { session }
await chrome.runtime.sendMessage({ action: 'ASSIGN_FOLDER_TO_SPACE',  payload: { folderId, spaceId } }); // → { folder }
const { sessions: spaceSessions } = await chrome.runtime.sendMessage({ action: 'GET_SESSIONS_IN_SPACE', payload: { spaceId } });
const { folders: spaceFolders }   = await chrome.runtime.sendMessage({ action: 'GET_FOLDERS_IN_SPACE',  payload: { spaceId } });
const { counts: spaceCounts }     = await chrome.runtime.sendMessage({ action: 'GET_SPACE_COUNTS' });  // { [id]: { folders, sessions } }

// ── Archive / long history (Pro to archive; list/restore/delete always allowed) ──
await chrome.runtime.sendMessage({ action: 'ARCHIVE_SESSION', payload: { id } });   // → { entry }  (Pro; moves session out of the active set)
const { archived } = await chrome.runtime.sendMessage({ action: 'LIST_ARCHIVED' }); // metadata only: { id, name, createdAt, archivedAt, tabCount }[]
await chrome.runtime.sendMessage({ action: 'RESTORE_ARCHIVED', payload: { id } });  // → { session }  (cap-exempt recovery)
await chrome.runtime.sendMessage({ action: 'DELETE_ARCHIVED',  payload: { id } });  // → { ok }  (permanent)

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

// Syncs the FULL vault (sessions + folders + smart folders + spaces), merged
// last-write-wins across devices. passphrase = E2E key, per-sync, never persisted.
await chrome.runtime.sendMessage({ action: 'SYNC_NOW', payload: { passphrase } });

// Password-strength indicator for the sync-setup UI (pure, ungated):
// → { score: 0-4, label: 'weak'|…, acceptable: boolean, warnings: string[] }
const { assessment } = await chrome.runtime.sendMessage({ action: 'ASSESS_PASSPHRASE', payload: { passphrase } });
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
  spaceId?:    string | null // project space (null = none)
  tags?:       string[]      // lowercase tag strings
}

Folder {
  id:          string
  name:        string
  color:       string | null
  spaceId?:    string | null // project space this folder belongs to
  createdAt:   number
  updatedAt:   number
}

SmartFolder {                // Pro — dynamic, rule-driven (no stored membership)
  id:          string
  name:        string
  color:       string | null
  rules:       RuleGroup     // { match: 'all'|'any', conditions: Condition[] }
  createdAt:   number
  updatedAt:   number
}
// Condition { field, op, value } — fields: name|url|title|tag|tabCount|createdAt|isAuto
//   string ops: contains|equals|startsWith|endsWith · number ops: eq|gt|gte|lt|lte · bool: eq

Space {                      // Pro — top-level workspace
  id:          string
  name:        string
  color:       string | null
  icon:        string | null
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
