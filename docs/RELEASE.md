# Release Readiness — Session Vault

Single view of what's done and what's blocking launch, across all three areas.
Companion to [`REQUIREMENTS.md`](REQUIREMENTS.md) (features), [`TIERS.md`](TIERS.md)
(free/Pro), and [`SECURITY.md`](SECURITY.md). _Updated: 2026-06-11._

Legend: ✅ done · 🚧 partial · ⬜ not started · 🔵 optional / post-launch

## Snapshot

- **139 tests green**; engine ↔ storage ↔ UI ↔ Supabase integrated.
- Cloud sync works end-to-end (verified live against real Supabase).
- Security audit done; pre-release fixes applied.
- Backend live: `vaults` table + RLS + Email/Password (Confirm email ON).

## ⭐ The decision that gates everything: MVP scope

**Billing is not built** — `entitlements.js` is a dev stub flag; there is no way
to actually charge users yet. So Pro features can't be *sold* at launch. Pick one:

- **Option A — Free-first launch (recommended, fastest):** ship the core safety
  net (save/restore/search/folders/trash/export) as a free extension. Defer Pro
  UI, billing, and possibly cloud sync to a follow-up. Removes most blockers below.
- **Option B — Full launch with Pro + sync:** requires real billing, all Pro
  feature UIs, Pro-gating UX, and custom SMTP. Weeks more work.

Everything below is tagged with which option needs it.

## Core Engine (`background/`) · Dexter

| Item | Status | Blocker? |
|---|---|---|
| Save/restore (multi-window), autosave, crash snapshot | ✅ | — |
| Full message API (folders, tags, smart folders, spaces, archive, sync…) | ✅ | — |
| Free/Pro gating + 50-session cap (`entitlements.js`) | ✅ | — |
| Supabase sync transport + auth (sign in/up, refresh) | ✅ | — |
| `GET_STORAGE_HEALTH` action (storage fn ready) | ⬜ | 🔵 optional |
| Real billing / licence validation | ⬜ | Option B |

## Storage (`storage/`) · us

| Item | Status | Blocker? |
|---|---|---|
| All free + paid storage features, hardened, validated | ✅ | — |
| Crypto (AES-GCM + PBKDF2 600k, legacy-blob fallback) | ✅ | — |
| Sync merge + proven round-trip; quota guard; import validation | ✅ | — |
| **Nothing outstanding** | ✅ | — |

## UI (`app/` — Flip Desk) · Lucik

Wired today: sessions, folders (create/move), trash, settings, stats, share,
**cloud-sync panel** (sign in/up + passphrase + strength), 3-step onboarding.

| Item | Status | Blocker? |
|---|---|---|
| Core session UX + sync panel | ✅ | — |
| **Crash-recovery prompt** (`RECOVER_LAST`) — core "never lose" promise | ⬜ | **Option A & B** |
| Pro-gating UX: `GET_ENTITLEMENTS` counter, `FREE_LIMIT_REACHED` / `PRO_REQUIRED` prompts | ⬜ | **Option B** (A: just show the 50 counter) |
| Folder rename/delete; full backup file export/import | ⬜ | 🔵 |
| Smart folders, spaces, tags, archive, lock, rename/duplicate | ⬜ | Option B |

## Backend / infra · team

| Item | Status | Blocker? |
|---|---|---|
| Supabase `vaults` + RLS + Email/Password, Confirm email ON | ✅ | — |
| Custom SMTP (default sender is rate-limited) | ⬜ | Option B (any launch with sync) |
| Revoke leaked `sb_secret_` key | ✅ | — |

## Store listing & legal · team

| Item | Status | Blocker? |
|---|---|---|
| Privacy policy text ([`PRIVACY.md`](PRIVACY.md)) | ✅ | — |
| Fill placeholders (name, date, contact email) + host at a public URL | ⬜ | **both** |
| Chrome Web Store "Privacy practices": data disclosure + permission justifications + Limited Use cert | ⬜ | **both** |
| Real extension icons (16/32/48/128) | ⬜ | **both** |
| Store listing: screenshots, description, category | ⬜ | **both** |
| $5 one-time Chrome Web Store developer registration | ⬜ | **both** |

## Definition of done — v1 (free-first / Option A)

1. Crash-recovery prompt wired in the UI (Lucik).
2. 50-session counter visible (Lucik) — friendly cap UX even without billing.
3. Real icons (Lucik).
4. Privacy policy: placeholders filled + hosted URL.
5. Store listing complete (assets + Privacy practices tab).
6. Decide: does sync ship in v1? If yes → custom SMTP first.

Storage has no items on this list — our part is done.
