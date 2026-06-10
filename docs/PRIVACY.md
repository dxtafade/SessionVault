# Privacy Policy — Session Vault

> **DRAFT** — review and adjust before publishing to the Chrome Web Store.
> A privacy policy is required because the extension accesses tab data; consider
> a legal review for your jurisdiction.

_Last updated: 2026-06-11_

## What Session Vault does

Session Vault saves, restores, and (optionally) syncs your browser tab sessions
so you never lose your tabs.

## What we store, and where

- **Your sessions** — the titles and URLs of tabs you choose to save, plus the
  folders, tags, and spaces you organize them into.
- **By default, everything stays on your device**, in the browser's local
  extension storage (`chrome.storage.local`). It is not sent anywhere.

## Cloud sync (optional, Pro)

If you turn on cloud sync:

- Your vault is **encrypted on your device** (AES-GCM, key derived from your
  passphrase) **before** it leaves the browser. The server only ever stores an
  opaque encrypted blob.
- Your **sync passphrase is never transmitted or stored** by us or the backend.
  It exists only in memory while you sync. **If you lose it, your synced data
  cannot be recovered** — that is the point of end-to-end encryption.
- We use **Supabase** as the storage/auth backend. It stores your account email
  (for sign-in) and your encrypted vault blob. Supabase cannot read your vault
  contents.

## What we do **not** do

- No selling or sharing of your data.
- No third-party analytics, ads, or behavioral tracking.
- No reading of page contents — only the tab title and URL of sessions you save.

## Permissions, and why

| Permission | Why |
|---|---|
| `tabs` | Read your open tabs so you can save and restore them |
| `storage` | Save your sessions locally in the browser |
| `alarms` | Run the autosave timer (Pro) |
| Host access to `*.supabase.co` | Only used when you opt in to cloud sync |

## Deleting your data

- **Local:** uninstalling the extension removes all locally stored sessions.
- **Cloud:** turning off sync signs you out; deleting your account / vault row
  removes the encrypted blob from the backend.

## Contact

_TODO: add a support email / contact before publishing._
