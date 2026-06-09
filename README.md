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

// Delete a session
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
