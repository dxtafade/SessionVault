# Security Review — pre-release

Read-only audit of the whole extension before release (2026-06-11).
**Verdict: no critical/high issues found — release-ready** once the items below
are addressed. Findings are grouped by owner so each dev fixes their own area.

## What's solid

- **XSS:** `app/app.js` escapes all site-controlled data (session names, tab
  titles/URLs, folder names/colors, email, status) via `esc()` — a correct
  `& < > " '` escaper. No `eval` / `new Function` / `document.write` anywhere.
- **CSP:** `manifest.json` does not override `content_security_policy`, so the
  strict MV3 default applies (no remote scripts, no eval).
- **E2E crypto** (`storage/crypto.js`): AES-GCM with a random salt+IV per call
  (no nonce reuse), non-extractable key, PBKDF2-HMAC-SHA256. The passphrase is
  per-sync and never persisted; the stored blob is opaque ciphertext.
- **Secrets:** only the Supabase **publishable** key is in code (safe to ship,
  protected by RLS). No `service_role` / `sb_secret_` in the repo.
- **Supabase RLS:** "own vault only" policy verified live — users can't read or
  write each other's rows.
- **Smart-folder rules:** fixed operators only, no regex → no ReDoS.
- **Import:** `importData` validates sessions and organization (folders / smart
  folders / spaces); a corrupt or hostile backup can't break the vault.

## Fixed in this review

A one-time, owner-approved pass applied the actionable findings across all areas
(commit history `a712d35` → latest):

- **Storage:** PBKDF2 **210k → 600k** (OWASP 2023; pre-release so no migration;
  bound to envelope `v1`, future changes bump the version).
- **Storage:** `sanitizeColor()` — folder/space/smart-folder colors are now
  validated to a hex format on write (createFolder/createSpace/createSmartFolder
  and their updates), neutralizing the inline-style injection vector at the source.
- **Core (`background/`):** `RESTORE_TAB` and `restoreSession` now only open
  `http(s)` URLs (`isSafeRestoreUrl`), so an imported backup can't auto-open
  `javascript:`/`data:`/`file:` URLs.
- **Core:** dropped the unused `"sessions"` permission from the manifest (least-privilege).
- **UI:** deleted dead `popup/*` (UI lives in `app/`) — less confusion, smaller surface.
- **Supabase:** "Confirm email" turned **ON** (verified — the backend now rejects
  the non-deliverable test domain it previously accepted).

## Remaining findings

| Sev | Area / owner | Issue | Recommendation |
|---|---|---|---|
| 🟢 Low | Core · Dexter | Auth tokens (`access` + `refresh`) stored plaintext in `chrome.storage.local`. Extension-isolated, but the refresh token is long-lived. | Acceptable for MVP; consider at-rest encryption or shorter TTL later. |
| 🟡 Med | Backend · team | With "Confirm email" ON, the **default Supabase email sender is rate-limited** (~a few/hour) — confirmation emails may not deliver at launch volume. | Configure custom SMTP (Resend/SendGrid) before a real launch. |

## Non-code release checklist

- [x] **Revoke** the `sb_secret_…` key that was exposed in chat. (done)
- [x] **Turn ON "Confirm email"** in Supabase Auth. (done — verified)
- [x] **Privacy policy** drafted → [`PRIVACY.md`](PRIVACY.md) (review + add contact/legal before publishing).
- [ ] **Custom SMTP** in Supabase so confirmation emails actually deliver at scale.
- [ ] **Real icons** (currently missing) — Lucik.
- [ ] Final once-over of `docs/PRIVACY.md` wording before the store listing.

## Scope note

This review reads across all layers but only modifies `storage/*` (the Storage
owner's area). Core/UI findings are reported here for their owners to fix.
