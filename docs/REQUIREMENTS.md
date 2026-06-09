# SessionVault — Requirements & Ownership

> Companion to [`TIERS.md`](TIERS.md) (free/Pro gating). This doc tracks **what**
> we're building, **who owns it**, and its **status** — so we stop rebuilding
> each other's work.

**Promise:** *Never lose your tabs again.* The safety net (manual save, crash
recovery, history) is free and uncapped; Pro sells convenience and scale.

## Team & file ownership

| Dev | Area | Files |
|---|---|---|
| **Dexter** | Core Engine | `background/service-worker.js`, `background/sync.js`, `background/entitlements.js` |
| **Lucik** | UI / design | `popup/*` |
| **(me)** | Storage | `storage/*`, `test/`, `package*.json`, `.github/` |

**Rule:** never edit another dev's files. Cross-layer needs go through the
message API (Core) or the exported storage functions (Storage). Reuse existing
primitives — check this table before building.

## Feature matrix

Status: ✅ done · 🛠 in progress · 📋 planned · 🔲 not started

### Free tier

| Feature | Owner | Status | Notes |
|---|---|---|---|
| Manual save / restore (multi-window) | Dexter | ✅ | |
| Crash recovery (`RECOVER_LAST`) | Dexter | ✅ | Uncapped, always on |
| Search | Storage (`searchSessions`) + Core enrich | ✅ | Core delegates to storage |
| Export / import (JSON, schema-validated) | Storage | ✅ | + gzip `.json.gz`, text |
| Trash / soft-delete (30-day TTL) | Storage | ✅ | Core wired |
| Lock session | Storage | ✅ | Core wired |
| **Basic folders** (manual organize) | **Storage (model) + Core (wire) + Lucik (UI)** | 🛠 | **Storage model DONE** — see below |
| Tags | Storage | ✅ | Powers folder-like filtering |
| 50-session free cap | Dexter (`entitlements.js`) | ✅ | |
| Popup UI | Lucik | ✅ | adapter + mock mode, search, settings |

### Pro tier

| Feature | Owner | Status | Notes |
|---|---|---|---|
| Timed autosave (gated) | Dexter | ✅ | Armed only when `pro` |
| Unlimited / long history | Storage (archive) + Core (lift cap) | 🛠 | **Storage archive DONE** — see below |
| **Tab deduplication** | **Dexter** | 🛠 | Uses storage primitives — see below |
| **Encrypted cloud sync + multi-device** | **Dexter (transport) + Storage (crypto)** | 🔲 | **Crypto unclaimed — Storage's next** |
| Smart folders (auto-rules), project spaces | Storage (rules) + Lucik (UI) | 📋 | Builds on basic folders |
| Billing / real licence | Dexter | 📋 | `entitlements.js` is a stub flag |

## Overlap resolution (read this before coding)

These three caused or risk duplication. Decisions:

### Basic folders → Storage model is DONE, do not rebuild
Storage already ships the data model (commit `8e4aaed`):
`createFolder`, `renameFolder`, `deleteFolder` (reassigns sessions to unfiled —
never loses them), `getFolders`, `assignSessionToFolder`, `getSessionsInFolder`,
plus tags (`addTag`/`removeTag`/`getAllTags`/`getSessionsByTag`).
**Dexter:** wire these into the message API; don't reimplement folder logic.
**Lucik:** build the folder UI against those actions.

### Tab deduplication → Dexter owns it; Storage will NOT add a merge
Storage provides the primitives only — `deduplicateTabs(session)` (de-dups tabs
within one session) and `findDuplicateSessions()` (groups identical sessions).
Dexter is building the user-facing dedup on top of these.
**Storage decision:** do **not** add `mergeDuplicateSessions` — it would
duplicate Dexter's in-flight work. If Dexter wants a storage-level merge helper,
he requests the exact signature and Storage adds it.

### Encrypted cloud sync → Storage builds the crypto module
`sync.js` has `encrypt`/`decrypt` stubbed (identity functions) with a
`TODO(core)`. The crypto over the session blob is a data/storage concern and is
**unclaimed**. Proposed: a new `storage/crypto.js`:
- AES-GCM encryption of the serialized blob
- key derived from the user's passphrase via PBKDF2 (SubtleCrypto)
- `encryptBlob(obj, passphrase)` / `decryptBlob(cipher, passphrase)` returning
  chrome.storage / transport-safe strings
`sync.js` imports it to replace the stubs; transport/merge stay Dexter's.
**Needs a 2-line agreement with Dexter on the function signatures first.**

## Do we still need encrypted sync & dedup merge?

- **Dedup merge:** ❌ No — Dexter is actively building dedup on the existing
  storage primitives. Storage adds nothing unless Dexter asks.
- **Basic folders:** ❌ No more Storage work — model is done; only wiring + UI remain.
- **Encrypted sync (crypto):** ✅ Yes — flagship Pro feature, unclaimed, and a
  clean self-contained Storage module. This is the recommended next Storage task,
  pending a quick signature agreement with Dexter.

## Coordination

- Everyone pushes to `main`; it moves fast → always `git fetch` + `git rebase
  origin/main` right before pushing.
- CI (`.github/workflows/test.yml`) runs `npm test` on every push/PR.
- Storage API + data shapes: [`storage/README.md`](../storage/README.md).
