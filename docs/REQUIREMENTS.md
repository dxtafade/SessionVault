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
| **Encrypted cloud sync + multi-device** | **Dexter (transport) + Storage (crypto)** | 🛠 | **Crypto DONE** (`storage/crypto.js`); transport stubbed, Dexter swaps in sync.js |
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

### Encrypted cloud sync → Storage built the crypto module ✅
Signatures locked in [`CRYPTO_CONTRACT.md`](CRYPTO_CONTRACT.md); `storage/crypto.js`
ships them: `encryptBlob(obj, passphrase)` / `decryptBlob(cipher, passphrase)`
(AES-GCM + PBKDF2, `v1.`-versioned envelope, `DECRYPT_FAILED` errors). 8 tests
cover the round-trip, non-determinism, and tamper/wrong-passphrase paths.
**Remaining (Dexter):** in `sync.js`, delete the identity stubs and
`import { encryptBlob, decryptBlob } from '../storage/crypto.js';`, then build the
transport (`pushRemote`/`pullRemote`).

## Do we still need encrypted sync & dedup merge?

- **Dedup merge:** ❌ No — Dexter is actively building dedup on the existing
  storage primitives. Storage adds nothing unless Dexter asks.
- **Basic folders:** ❌ No more Storage work — model is done; only wiring + UI remain.
- **Encrypted sync (crypto):** ✅ Done — `storage/crypto.js` shipped to the locked
  contract. Dexter swaps the stubs in `sync.js` and builds transport next.

## Coordination

- Everyone pushes to `main`; it moves fast → always `git fetch` + `git rebase
  origin/main` right before pushing.
- CI (`.github/workflows/test.yml`) runs `npm test` on every push/PR.
- Storage API + data shapes: [`storage/README.md`](../storage/README.md).
