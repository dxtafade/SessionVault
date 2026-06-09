# Free vs Pro

The product promise — **"Never lose your tabs again"** — must hold on the free
plan. So the safety net (manual save, crash recovery, history) is always free
and never capped. Pro sells *convenience and scale*: automation, cloud, more
room, organization.

## Free

| Feature | Notes |
|---|---|
| Manual save / restore | Multi-window, restores original windows |
| **Crash recovery** | Rolling emergency snapshot, `RECOVER_LAST` — unlimited, always on |
| Search | Name + tab title/url |
| Export / import | JSON backup, schema-validated |
| Trash (soft delete) | 30-day undo before purge |
| Lock | Protect a session from delete / pruning |
| Basic folders | Manual organization — wired (storage owns persistence); UI pending |
| Tags | Wired & ungated (`ADD_TAG`/`REMOVE_TAG`/`GET_ALL_TAGS`/`GET_SESSIONS_BY_TAG`) |
| **Up to 50 saved sessions** | Manual saves only; autosaves & trash don't count |

## Pro

| Feature | Status |
|---|---|
| **Timed autosave** | Engine ready, gated on `pro` |
| Encrypted cloud sync + multi-device | Crypto wired (`storage/crypto.js`); transport still stubbed |
| Unlimited / long history (archive) | Wired & gated — `ARCHIVE_SESSION` (Pro); list/restore/delete ungated. Auto-archive runs on startup for Pro |
| Smart folders (rule-driven) | Wired & gated (`CREATE/UPDATE/DELETE/EVALUATE_SMART_FOLDER`, `PREVIEW_RULES`) |
| Project spaces (Space > Folder > Session) | Wired & gated (`CREATE/UPDATE/DELETE_SPACE`, assign/query) |
| Tab deduplication | Wired & gated (`DEDUPLICATE_SESSION`, `FIND_DUPLICATE_SESSIONS`) |

## How the gate works (engine)

- `background/entitlements.js` owns the `pro` flag (`chrome.storage` key
  `entitlements`) and `FREE_SESSION_LIMIT = 50`.
- **Autosave:** `scheduleAutosave()` only arms the alarm when `pro && autosaveEnabled`.
  The alarm handler re-checks `isPro()`.
- **50-session cap:** `SAVE_SESSION` and `DUPLICATE_SESSION` call
  `assertCanSaveManual()`, which throws `FREE_LIMIT_REACHED: …` when a free user
  is at the cap. No data is ever deleted — the user clears space or upgrades.
- **Exempt from the cap:** `RECOVER_LAST` and `IMPORT_SESSIONS` (recovery flows).
- **Pro-only actions** call `assertPro()`, which throws `PRO_REQUIRED: …`:
  dedup, smart folders, spaces, and `ARCHIVE_SESSION`.
- **Always ungated** (retrieving your own data is never blocked): basic folders,
  tags, `RESTORE_ARCHIVED`, `LIST_ARCHIVED`, restore-from-trash, and all reads
  (`GET_SMART_FOLDERS`, `GET_SPACES`, counts). A downgraded user keeps access to
  everything they made.

## Toggling Pro while building

There's no billing yet. Flip the flag from the engine for testing:

```js
await chrome.runtime.sendMessage({ action: 'SET_PRO', payload: { pro: true } });
const { entitlements, limits } = await chrome.runtime.sendMessage({ action: 'GET_ENTITLEMENTS' });
// entitlements: { pro }   limits: { freeSessionLimit: 50 }
```

## UI hooks (for the UI dev)

- Call `GET_ENTITLEMENTS` on open: show a `47 / 50` counter, an **Upgrade**
  button, and a Pro lock on the Autosave setting when `pro === false`.
- Wrap `SAVE_SESSION` in try/catch; on an error message starting with
  `FREE_LIMIT_REACHED`, show the upgrade-or-clean-up prompt instead of a raw error.
