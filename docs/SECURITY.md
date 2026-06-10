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

## Fixed in this review (Storage)

- PBKDF2 iterations **210k → 600k** (OWASP 2023). Done now because pre-release
  means no real vaults exist yet (no migration). Bound to envelope version `v1`;
  any future change bumps the version prefix so old blobs still decrypt.
  (commit `a712d35`)

## Findings — Core Engine (`background/`) · owner: Dexter

| Sev | Issue | Recommendation |
|---|---|---|
| 🟡 Low-Med | `RESTORE_TAB` / `restoreSession` open a saved URL with **no scheme filter**. A malicious *imported* backup could carry `javascript:` / `data:` URLs. Chrome blocks `javascript:` in `tabs.create`, but this is defense-in-depth. | Filter restore URLs to an `http(s)` allowlist (reuse `isRestoreable`) before `chrome.tabs.create`. |
| 🟢 Low | Auth tokens (`access` + `refresh`) are stored **plaintext** in `chrome.storage.local`. Extension-isolated, but the refresh token is long-lived. | Acceptable for MVP; consider at-rest encryption or a shorter TTL later. |
| 🟢 Low | `"sessions"` permission in the manifest appears unused. | Drop it for least-privilege if truly unused. |
| 🟠 **Release-blocker** | **"Confirm email" is OFF in Supabase** (disabled for dev). | **Turn it back ON before release** — otherwise anyone can register accounts against other people's emails. |

## Findings — UI (`app/`) · owner: Lucik

| Sev | Issue | Recommendation |
|---|---|---|
| 🟢 Low | Folder color is interpolated into an inline `style` (`background:${esc(color)}`). `esc()` prevents attribute breakout but doesn't validate CSS. | Validate the color format (`#rrggbb`) at creation — defense-in-depth. |
| ℹ️ Info | `popup/*` is now dead code (UI moved to `app/`). | Delete it to avoid confusion and reduce attack surface. |

## Non-code release checklist

- [ ] **Revoke** the `sb_secret_…` key that was exposed in chat (Settings → API keys → Revoke).
- [ ] **Turn ON "Confirm email"** in Supabase Auth for production.
- [ ] **Privacy policy** for the Chrome Web Store listing — the extension reads
      *all* tabs (sensitive); state that vault data is end-to-end encrypted.
- [ ] **Real icons** (currently missing; blocked unpacked load earlier).

## Scope note

This review reads across all layers but only modifies `storage/*` (the Storage
owner's area). Core/UI findings are reported here for their owners to fix.
