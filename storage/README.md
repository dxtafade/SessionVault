# Storage Layer

All read/write to `chrome.storage.local` lives here. The Core Engine and UI
call these functions — they never touch `chrome.storage` directly.

- [`storage.js`](storage.js) — sessions, settings, search, dedup, trash, lock, export/import, stats
- [`file-transfer.js`](file-transfer.js) — JSON file download/upload (popup context)
- Tests: [`storage.test.js`](storage.test.js), [`file-transfer.test.js`](file-transfer.test.js) — run `npm test`

> **Storage owns these files only.** Wiring any of this into the message API
> (`background/service-worker.js`) is the Core Engine's job.

## Data shapes

```ts
Session {
  id: string
  name: string
  createdAt: number      // unix ms
  updatedAt: number
  tabs: Tab[]
  isAuto: boolean        // true = created by autosave
  locked?: boolean       // protected from trashing
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
  maxAutoSessions: number
}
```

Storage keys: `sessions`, `settings`, `trash`, `_schemaVersion` (current: **1**).

## `storage.js` API

### Sessions
| Function | Returns | Notes |
|---|---|---|
| `getAllSessions()` | `{ [id]: Session }` | Whole map |
| `getSession(id)` | `Session \| null` | |
| `saveSession(session)` | `void` | Insert or overwrite |
| `deleteSession(id)` | `void` | Hard delete (raw primitive) |
| `clearAllSessions()` | `void` | |

### Settings
| Function | Returns |
|---|---|
| `getSettings()` | `Settings` (defaults merged in) |
| `updateSettings(partial)` | `void` |

### Search & dedup
| Function | Returns | Notes |
|---|---|---|
| `searchSessions(query)` | `Session[]` | By name / tab title / URL, newest-first |
| `deduplicateTabs(session)` | `Session` | New object, duplicate URLs removed |
| `findDuplicateSessions()` | `string[][]` | Groups of session ids with identical tab sets |

### Lock
| Function | Returns | Notes |
|---|---|---|
| `lockSession(id)` | `Session` | Sets `locked = true` |
| `unlockSession(id)` | `Session` | |

### Trash (soft delete)
| Function | Returns | Notes |
|---|---|---|
| `trashSession(id, { force })` | `TrashEntry` | Throws on locked unless `force: true` |
| `getTrash()` | `{ [id]: TrashEntry }` | `TrashEntry` = `Session & { trashedAt }` |
| `restoreFromTrash(id)` | `Session` | Moves back, strips `trashedAt` |
| `deleteFromTrash(id)` | `void` | Permanent |
| `emptyTrash()` | `void` | Permanent, all |
| `purgeExpiredTrash(ttlDays = 30)` | `number` | Count purged; call on a schedule |

### Export / import
| Function | Returns | Notes |
|---|---|---|
| `exportData()` | `{ _exportedAt, _schemaVersion, sessions, settings }` | |
| `importData(blob, mode = 'merge')` | `{ imported, skipped }` | `mode`: `'merge'` \| `'replace'`; skips malformed |
| `exportSessionAsText(id)` | `string` | Tab URLs, newline-separated |

### Stats & maintenance
| Function | Returns |
|---|---|
| `getStorageUsage()` | `{ used, quota, percent }` |
| `getStorageStats()` | `{ sessions: { total, auto, manual, locked }, totalTabs, trashCount, usage }` |
| `migrateIfNeeded()` | `void` — stamp schema version (call on install/update) |

## `file-transfer.js` API

Popup context only — these touch the DOM. The data helpers are safe anywhere.

| Function | Returns | Notes |
|---|---|---|
| `backupFilename(date?)` | `string` | `session-vault-backup-YYYY-MM-DD.json` |
| `toJSONString(data)` | `string` | Pretty JSON |
| `downloadJSON(data, filename?)` | `void` | Triggers a file download |
| `downloadBackup()` | `void` | `exportData()` + download |
| `pickJSONFile()` | `Promise<File>` | Opens OS file picker |
| `readJSONFile(file)` | `Promise<object>` | Parses; throws on bad JSON |
| `importFromFile(file, mode?)` | `Promise<{ imported, skipped }>` | Read + import |

### Example (UI → Storage, in the popup)

```js
import { downloadBackup, pickJSONFile, importFromFile } from '../storage/file-transfer.js';

// Save a backup to disk
exportBtn.addEventListener('click', () => downloadBackup());

// Restore from a chosen file
importBtn.addEventListener('click', async () => {
  const file = await pickJSONFile();
  const { imported, skipped } = await importFromFile(file, 'merge');
  console.log(`Imported ${imported}, skipped ${skipped}`);
});
```

## Pending Core Engine wiring

These storage ops have no message-API action yet — for the Core dev to add to
`background/service-worker.js`:

`trashSession`, `restoreFromTrash`, `deleteFromTrash`, `emptyTrash`, `getTrash`,
`purgeExpiredTrash`, `lockSession`, `unlockSession`, `exportSessionAsText`,
`getStorageStats`.
