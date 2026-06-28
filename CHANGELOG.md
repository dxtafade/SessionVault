# Changelog — Session Vault

## Latest update — 2026-06-28

**Tabs**
- "Save open tabs" now also **closes** the saved tabs (save & clear) — pinned tabs
  and the extension's own page are kept.
- Tab picker: choose which open tabs to save.
- **Restore** opens a session's tabs into your **current window** (no second
  Chrome window for a single-window session).

**Reliability**
- Crash recovery now uses a real clean-exit heuristic — the "browser closed
  unexpectedly?" banner only appears after an actual crash, not on a normal
  restart.

**UI**
- RU / ENG language switch across the whole interface (toggle in the header).
- Account password recovery ("Forgot password?") with a dedicated reset screen +
  show/hide password toggle.
- Confirm-password field on sign-up (reveals as you type).
- On-brand auth pages (confirm-email, email-confirmed, reset-password) + emails.
- Fixes: new-folder card no longer overlaps the title; on-brand "new shelf" (+)
  button and onboarding Skip button; smoother confirm-password reveal.

**Release prep**
- Free, local-only build on branch `release/free-no-sync` (cloud sync behind a flag).
- Privacy policy (page + `docs/privacy.html`), Web Store listing copy and Lucik's
  store-card brief under `docs/`.
