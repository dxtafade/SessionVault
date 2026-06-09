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

// Restore a session (opens all tabs)
await chrome.runtime.sendMessage({ action: 'RESTORE_SESSION', payload: { id } });

// Delete a session
await chrome.runtime.sendMessage({ action: 'DELETE_SESSION', payload: { id } });

// Read settings
const { settings } = await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });

// Update settings
await chrome.runtime.sendMessage({
  action: 'UPDATE_SETTINGS',
  payload: { autosaveEnabled: true, autosaveInterval: 15 }
});
```

## Data shapes

```ts
Session {
  id: string
  name: string
  createdAt: number   // unix ms
  updatedAt: number
  tabs: Tab[]
  isAuto: boolean     // true = created by autosave
}

Tab {
  url: string
  title: string
  favIconUrl: string
  pinned: boolean
  index: number
}

Settings {
  autosaveEnabled: boolean
  autosaveInterval: number   // minutes
  maxAutoSessions: number    // how many autosave snapshots to keep
}
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder
