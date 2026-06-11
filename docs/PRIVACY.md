# Privacy Policy — Session Vault

_Effective date: **[FILL IN: e.g. 11 June 2026]**_
_Maintained by: **[FILL IN: developer or company name]** ("we", "us", "our")._
_Contact: **[FILL IN: support email]**_

> Fill in the three bracketed fields above, host this page at a public URL, and
> paste that URL into the Chrome Web Store listing (see `docs/SECURITY.md` /
> the publishing notes). This is a good-faith template, not legal advice — if you
> collect payments or operate in the EU/California, consider a quick legal review.

## Summary (plain language)

Session Vault saves and restores your browser tabs. **By default everything stays
on your device.** If you turn on optional cloud sync, your data is **encrypted on
your device before it leaves it** — we and our backend only ever see scrambled
data we cannot read. We do not sell your data, show ads, or track your browsing.

## 1. Scope

This policy applies to the **Session Vault** browser extension and its optional
cloud-sync service.

## 2. Information we handle

**Session data you choose to save** — the titles and URLs of your open tabs, and
the folders, tags, and project spaces you organize them into. This is created
only when you (or the autosave feature you enabled) save a session.

**Account information (only if you enable cloud sync)** — the email address you
use to create a sync account, for authentication.

**Your sync passphrase is never collected.** It is used on your device to encrypt
and decrypt your data and is never transmitted to or stored by us. If you lose it,
your synced data cannot be recovered — that is the nature of end-to-end encryption.

**What we do _not_ collect:** your general browsing history, page contents, form
inputs, keystrokes, IP-based tracking, or behavioral analytics.

## 3. Where your data is stored

- **Local-first:** by default, all session data is stored on your device in the
  browser's extension storage (`chrome.storage.local`) and is never sent anywhere.
- **Optional cloud sync (Pro):** if you enable it, your vault is **end-to-end
  encrypted** on your device (AES-GCM, key derived from your passphrase via
  PBKDF2) before upload. Our backend stores only the encrypted blob plus your
  account email for sign-in.

## 4. How we use your information

We use it solely to provide the extension's features: saving, restoring, and (if
enabled) syncing your sessions across your own devices. We do **not** sell or rent
your data, use it for advertising, or share it with third parties except the
service provider needed to operate sync (see below).

## 5. Service providers (subprocessors)

- **Supabase** — authentication and encrypted storage backend, used **only if you
  enable cloud sync**. Supabase stores your email and your encrypted vault blob;
  it cannot read your vault contents. See Supabase's privacy policy at
  https://supabase.com/privacy.

## 6. Data retention and deletion

- **Local data:** removed when you delete a session or uninstall the extension.
- **Cloud data:** turning off sync signs you out; deleting your account or vault
  removes the encrypted blob from the backend.
- To request deletion of any data associated with your account, contact us at the
  email above.

## 7. Security

- Cloud data is end-to-end encrypted (AES-GCM 256-bit; key derived with
  PBKDF2-HMAC-SHA256). The encryption passphrase never leaves your device.
- The backend enforces per-user access control so users can only access their own
  data.
- No security measure is perfect; we cannot guarantee absolute security.

## 8. Your rights

Depending on your jurisdiction (e.g. GDPR / CCPA) you may have the right to access,
correct, export, or delete your personal data, and to withdraw consent. You can
export your sessions at any time from within the extension, and request account
deletion via the contact email. **We do not sell personal information.**

## 9. Children

Session Vault is not directed to children under 13 (or the minimum age in your
jurisdiction) and we do not knowingly collect their data.

## 10. Permissions the extension requests

| Permission | Why it's needed |
|---|---|
| `tabs` | Read your open tabs so you can save and restore them |
| `storage` | Save your sessions locally in the browser |
| `alarms` | Run the autosave timer (Pro) |
| Access to `*.supabase.co` | Only used when you opt in to cloud sync |

## 11. Changes to this policy

We may update this policy; material changes will be reflected by updating the
effective date above and, where appropriate, an in-product notice.

## 12. Contact

Questions or data requests: **[FILL IN: support email]**.
