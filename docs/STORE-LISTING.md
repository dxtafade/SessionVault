# Chrome Web Store listing — Session Vault (free, local-only v1)

Everything needed to publish the free build (`release/free-no-sync`). Copy fields
into the Web Store dashboard; image specs + shot list are the brief for Lucik.

---

## A. Listing text (copy-paste)

**Item name**
```
Session Vault — Tab & Session Manager
```

**Short description** (summary, max 132 chars)
```
Never lose your tabs again. Save, restore and organize browser sessions — 100% local & private. English / Русский.
```

**Category:** Productivity
**Language:** English (primary) + Russian — the UI ships bilingual (in-app RU/ENG toggle).

**Detailed description**
```
Session Vault turns a mess of open tabs into tidy, restorable sessions — laid out
on a tactile "desk" you actually enjoy using.

WHAT IT DOES
• Save all your open tabs into one session with a click — then close them and let
  your browser breathe.
• Restore a whole session (or a single tab) whenever you need it back.
• Organize sessions into colorful shelves (folders), drag them around the desk,
  and find anything with instant search.
• Crash recovery: if your browser closes unexpectedly, Session Vault offers to
  bring your tabs back.
• A bin with undo — nothing is lost by accident.
• Light & dark desk themes, calm motion option, and a built-in RU/ENG language
  switch.

PRIVATE BY DESIGN
Everything stays on your device. No account, no sign-in, no servers, no tracking,
no ads. Session Vault collects nothing about you — your tabs never leave your
computer.

Never lose your tabs again.
```

**Privacy policy URL** (host first, then paste)
```
https://dxtafade.github.io/SessionVault/privacy.html
```

---

## B. Privacy practices tab (Web Store → Privacy)

- **Single purpose:** "Save, organize and restore the user's browser tabs as sessions, stored locally on the device."
- **Permission justifications:**
  - `tabs` — read titles/URLs of open tabs to save a session and reopen them on restore.
  - `storage` — store saved sessions locally in the browser (chrome.storage.local).
  - `alarms` — run the optional local autosave timer.
  - (No host permissions — the free build makes no network requests.)
- **Data collection disclosure:** select **"This item does not collect user data."**
- **Limited Use:** tick the certification — we don't transmit, sell, or use data for anything beyond the single purpose (trivially true: nothing leaves the device).

---

## C. Image assets — brief for Lucik

Produce in the Flip Desk brand (paper/ink palette, mustard accent, Archivo
headings, real screenshots of the extension). Export PNG.

| Asset | Size | Required? | Notes |
|---|---|---|---|
| Store icon | 128×128 | ✅ have it | `icons/icon128.png` (Deck logo) — reuse |
| Screenshots | **1280×800** (or 640×400) | ✅ need ≥1, aim for 5 | PNG/JPG, the main selling surface |
| Small promo tile | 440×280 | recommended | shown in store grids |
| Marquee promo | 1400×560 | optional | only if featured |

**Screenshot shot list (5), each with a short caption baked in or as overlay:**
1. **The desk full of sessions** — several session stacks on shelves. Caption: "All your tabs, tidied into sessions."
2. **Save open tabs** — the "＋ SAVE OPEN TABS" action / a fresh session appearing. Caption: "One click to save everything."
3. **Deal-out / restore** — the card spread of a session's tabs with Restore all. Caption: "Bring a whole session back instantly."
4. **Crash recovery banner** — the "Did your browser close unexpectedly?" prompt. Caption: "Never lose your tabs to a crash."
5. **Bilingual + themes** — settings or the RU/ENG toggle + dark theme. Caption: "Light or dark · English / Русский."

**Style guidance:**
- Use real app screenshots (load `release/free-no-sync` unpacked), captured clean — no ☁ cloud button in this build (good, it's hidden).
- Frame on the desk background (`#E9E1D2` grain) with generous padding; optional short caption in Archivo bold, one mustard accent.
- Keep text minimal and legible at thumbnail size.
- Make at least one RU screenshot (toggle the language) to show bilingual support.

**Deliverable:** 5× 1280×800 PNG + 1× 440×280 PNG, dropped in a `store/` folder or shared however the team prefers.

---

## D. Remaining to publish (owners)

- ⬜ Host `privacy.html` (now on `main` → publishes via GitHub Pages) — **us**
- ⬜ Image assets per section C — **Lucik**
- ⬜ Create Web Store item, paste A + B, upload a ZIP of the `release/free-no-sync` build, attach images — **team**
- ⬜ $5 one-time developer registration — **team**
