# Storage Layer

All read/write to `chrome.storage.local` lives here. The Core Engine and UI
call these functions — they never touch `chrome.storage` directly.

- [`storage.js`](storage.js) — sessions, settings, search, dedup, trash, lock, folders, tags, archive, export/import, stats
- [`file-transfer.js`](file-transfer.js) — JSON/gzip file download/upload (popup context)
- [`gzip.js`](gzip.js) — gzip + base64 helpers (shared by archive + file-transfer)
- [`crypto.js`](crypto.js) — client-side encryption for sync (see [`docs/CRYPTO_CONTRACT.md`](../docs/CRYPTO_CONTRACT.md))
- Tests: `*.test.js` in this folder — run `npm test` (77 tests)

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
  folderId?: string|null // smart folders / project spaces
  tags?: string[]        // free-form labels (normalized lowercase)
}

Tab {
  url: string
  title: string
  favIconUrl: string
  pinned: boolean
  index: number
  windowIndex?: number   // set by Core's multi-window capture
}

Folder {
  id: string
  name: string
  color?: string|null
  createdAt: number
  updatedAt: number
}

ArchivedEntry {           // metadata is plain; payload is compressed
  id: string
  name: string
  createdAt: number
  archivedAt: number
  tabCount: number
  data: string            // base64(gzip(JSON(session)))
}

Settings {
  autosaveEnabled: boolean
  autosaveInterval: number   // minutes
  maxAutoSessions: number
}
```

Storage keys: `sessions`, `settings`, `trash`, `folders`, `archive`, `_schemaVersion` (current: **2**).

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

### Folders / project spaces
| Function | Returns | Notes |
|---|---|---|
| `getFolders()` | `{ [id]: Folder }` | |
| `getFolder(id)` | `Folder \| null` | |
| `createFolder(name, { color? })` | `Folder` | |
| `renameFolder(id, name)` | `Folder` | |
| `deleteFolder(id, { reassignTo = null })` | `void` | Sessions inside move to `reassignTo` — never lost |
| `assignSessionToFolder(id, folderId\|null)` | `Session` | `null` = unfiled |
| `getSessionsInFolder(folderId\|null)` | `Session[]` | newest-first; `null` = unfiled |

### Tags
| Function | Returns | Notes |
|---|---|---|
| `addTag(id, tag)` | `Session` | Normalized lowercase, de-duplicated |
| `removeTag(id, tag)` | `Session` | Case-insensitive |
| `getAllTags()` | `string[]` | Distinct, sorted |
| `getSessionsByTag(tag)` | `Session[]` | newest-first |

### Archive (long history)
| Function | Returns | Notes |
|---|---|---|
| `getArchive()` | `{ [id]: ArchivedEntry }` | Raw (payloads compressed) |
| `listArchived()` | `Array<{id,name,createdAt,archivedAt,tabCount}>` | Metadata only, newest-first |
| `archiveSession(id)` | `ArchivedEntry` | Moves out of active set, gzips payload |
| `restoreArchived(id)` | `Session` | Decompresses back into active set |
| `deleteArchived(id)` | `void` | Permanent |
| `autoArchiveOldSessions({ olderThanDays = 30, keepRecent = 50 })` | `number` | Count archived; skips locked; call on a schedule |

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
| `getStorageStats()` | `{ sessions: { total, auto, manual, locked }, totalTabs, trashCount, archivedCount, folderCount, usage }` |
| `migrateIfNeeded()` | `void` — stamp schema version (call on install/update) |

## `gzip.js` API

Environment-agnostic (SW / popup / Node).

| Function | Returns | Notes |
|---|---|---|
| `gzipString(text)` | `Promise<Uint8Array>` | Gzip-compress (CompressionStream) |
| `gunzipToString(bytes)` | `Promise<string>` | Decompress |
| `bytesToBase64(bytes)` / `base64ToBytes(b64)` | — | chunk-safe base64 |
| `compressToBase64(text)` / `decompressFromBase64(b64)` | `Promise<string>` | chrome.storage-safe compressed string |

## `crypto.js` API

Client-side encryption for encrypted cloud sync (Pro). Implements the locked
contract in [`docs/CRYPTO_CONTRACT.md`](../docs/CRYPTO_CONTRACT.md). AES-GCM over
JSON, key from PBKDF2(passphrase). The passphrase is per-call and never persisted.

| Function | Returns | Notes |
|---|---|---|
| `encryptBlob(obj, passphrase)` | `Promise<string>` | Opaque `v1.`-prefixed base64; random salt/iv per call; throws on empty passphrase |
| `decryptBlob(cipher, passphrase)` | `Promise<object>` | Inverse; throws `DECRYPT_FAILED…` on wrong passphrase / tampered data |

Core's `sync.js` imports these two and nothing else.

## `file-transfer.js` API

Popup context only — these touch the DOM. The data helpers are safe anywhere.

| Function | Returns | Notes |
|---|---|---|
| `backupFilename(date?)` | `string` | `session-vault-backup-YYYY-MM-DD.json` |
| `toJSONString(data)` | `string` | Pretty JSON |
| `gzipString(text)` | `Promise<Uint8Array>` | Gzip-compress (CompressionStream) |
| `gunzipToString(bytes)` | `Promise<string>` | Decompress gzip bytes |
| `downloadJSON(data, filename?)` | `void` | Triggers a file download |
| `downloadBackup()` | `void` | `exportData()` + download (`.json`) |
| `downloadBackupCompressed()` | `void` | `exportData()` + gzip + download (`.json.gz`) |
| `pickJSONFile()` | `Promise<File>` | Opens OS file picker (`.json` / `.gz`) |
| `readJSONFile(file)` | `Promise<object>` | Parses plain JSON; throws on bad JSON |
| `readBackupFile(file)` | `Promise<object>` | Auto-detects gzip vs JSON via magic bytes |
| `importFromFile(file, mode?)` | `Promise<{ imported, skipped }>` | Read JSON + import |
| `importBackupFile(file, mode?)` | `Promise<{ imported, skipped }>` | Read (plain **or** gz) + import |

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

Trash, lock, search, export/import, stats, and migration are already wired by
Dexter (Core) as of `98a8475`.

Still no message-API action — for Dexter to add to `background/service-worker.js`
when the UI needs them:

- **Folders:** `createFolder`, `renameFolder`, `deleteFolder`, `getFolders`,
  `assignSessionToFolder`, `getSessionsInFolder`
- **Tags:** `addTag`, `removeTag`, `getAllTags`, `getSessionsByTag`
- **Archive:** `archiveSession`, `restoreArchived`, `deleteArchived`,
  `listArchived`, `autoArchiveOldSessions` (good candidate for a startup/alarm call)
