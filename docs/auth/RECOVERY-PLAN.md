# Password recovery — team plan

Account-password recovery ("Forgot password?"). Covers the **account password**
(recoverable via Supabase). The **E2E passphrase** stays unrecoverable by design
and is untouched by any of this.

The feature **logic is already built** (on branch `feat/signup-confirm-password`):
extension UI link → engine `RECOVER_PASSWORD` → Supabase reset email → landing
page sets the new password. What's left is **hosting**, **design**, and the
**Supabase dashboard config** — split across the team below.

> Status of the auth pages: they work, but the visuals are placeholder-grade
> (plain inline CSS). They need to be **properly designed** to match Session Vault.

---

## 🎨 Lucik — design the auth pages (UI/design owner)

Make the auth pages look like Session Vault, not a generic form. Today they're
functional but plain — reskin them to our brand.

**Pages to design (3 surfaces):**
1. **Confirm-signup email** — `docs/auth/confirm-email.html`
2. **Reset-password email** — `docs/auth/reset-password-email.html`
3. **Landing page** — `docs/auth/confirmed.html` — ONE page, **4 states**:
   - `view-confirmed` — "Email confirmed"
   - `view-recovery` — "Set a new password" form (new + confirm password)
   - `view-done` — "Password updated"
   - `view-error` — "This link didn't work"

**Two different design contexts — don't treat them the same:**
- **The landing page** is a real browser page → use the full design system:
  Archivo/Space Mono web fonts, paper texture, hard offset shadows, the brand
  palette, the tactile button feel — match the Flip Desk in `app/app.css`.
- **The emails** render in mail clients → **inline styles + table layout only**,
  no `<style>`, no JS, web fonts won't load (fall back to system fonts). Aim for
  "on-brand and clean" (logo, palette, dark CTA button), not a pixel match.

**⚠️ Design contract — keep the wiring intact (don't break the mechanism):**
- Landing page: keep these element **IDs** and the inline `<script>` exactly —
  `view-confirmed / view-recovery / view-done / view-error`, `reset-form`,
  `pw`, `pw2`, `reset-btn`, `reset-msg`, `error-text`. Restyle markup/CSS around
  them; if you restructure, keep the IDs and the JS behavior (fragment parsing →
  `PUT /auth/v1/user` → view switching, the ≥6-char + match validation, and the
  address-bar token scrub).
- Emails: keep the Supabase placeholders `{{ .ConfirmationURL }}` and
  `{{ .Email }}` — Supabase fills them at send time.
- Reference look: `app/app.css` (button language `.btn-squash`/`.onb-next`,
  palette vars, fonts). The current files are a working starting point to reskin.

---

## 🌐 Dexter — hosting + engine ownership (repo + Core owner)

**1. Host the landing page on GitHub Pages** (only Dexter can — it's his repo,
`github.com/dxtafade/SessionVault`):
- Enable GitHub Pages and publish `docs/auth/confirmed.html`.
- Send the final public URL back to Sultan for the Supabase config
  (e.g. `https://dxtafade.github.io/SessionVault/docs/auth/confirmed.html`).
- One page covers BOTH confirmation and recovery (it branches on the link type),
  so only this one file needs to be reachable.

**2. Own/review the engine side** (it lives in your files, added on the branch):
- `background/sync.js` → `recoverPassword(email)` (POST `/auth/v1/recover`).
- `background/service-worker.js` → `RECOVER_PASSWORD` action.
- Reload the MV3 service worker after pulling (sync.js changes get cached).

---

## ⚙️ Sultan (me) — Supabase dashboard + flow check (my remaining part)

Do this AFTER Dexter sends the hosted URL. ~10 min, all in the dashboard.

1. **Authentication → URL Configuration**
   - **Site URL** → the hosted `confirmed.html` URL from Dexter.
   - **Redirect URLs** → add that **same URL** to the allowlist (recovery won't
     redirect to it otherwise).
2. **Authentication → Email Templates**
   - **Reset Password** → paste the body of `docs/auth/reset-password-email.html`.
   - **Confirm signup** → paste `docs/auth/confirm-email.html` (if not already).
   - (Use Lucik's redesigned versions once they land.)
3. **Verify the flow type (important).** The page assumes the **implicit flow**
   (link lands with `#access_token=…` in the fragment — the default for our REST
   `/auth/v1/recover` call). Trigger a reset and check the URL the email link
   opens: `#access_token=…` ✅ implicit, all good. If `?code=…` → it's **PKCE**,
   the page needs a code-exchange step → tell Claude to add the PKCE branch.
4. **Test end-to-end:** extension → Cloud Sync → Sign in → **Forgot password?**
   (real confirmed email) → open email → **Set a new password →** → enter new
   password → **Update password** → back in the extension, sign in with it.

---

## Order of work (dependencies)

1. **Lucik** redesigns the 3 surfaces (can start now — independent).
2. **Dexter** hosts `confirmed.html` on Pages → hands the URL to Sultan.
   (Can host the current version immediately; re-deploy after Lucik's redesign.)
3. **Sultan** does the Supabase config with that URL + verifies the flow.
4. **Anyone** runs the end-to-end test.

## Notes / gotchas
- Recovery token is in the URL fragment (client-only, never hits a server); the
  page scrubs it from the address bar after reading. Don't paste that full URL.
- Min password length is 6 (enforced on the page and by Supabase).
- The publishable key (`sb_publishable_…`) is embedded in the page — fine, it's
  the same anon key already shipped in the extension. **Never** put `sb_secret_…`
  in the page or git.
- Rate-limited resets surface a friendly "too many attempts" message.
