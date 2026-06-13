/**
 * SessionVault — The Flip Desk (full-page UI).
 *
 * Folder-tab rail across the top; the open folder is the live desk. Session
 * "stacks" sit on the desk — drag them around, click to deal the tabs out,
 * drop on the bin to trash. Everything is wired to the Core Engine via ./api.js.
 */
import * as api from './api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

// ── tiny helpers ──────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}
const PALETTE = ['#2D9D78', '#E8744F', '#7B6CF6', '#D9A431', '#C4524E', '#3A86C8', '#1a73e8', '#d92b2b'];
function colorFor(str) {
  let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function ageOf(ms) {
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000), h = Math.floor(d / 3.6e6), day = Math.floor(d / 8.64e7);
  if (day > 1) return `${day} days ago`;
  if (day === 1) return 'yesterday';
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return 'just now';
}

// default desk slots for stacks, by index
const POS = [
  { x: 96, y: 40, r: -3 }, { x: 404, y: 236, r: 2.5 }, { x: 706, y: 36, r: -1.5 },
  { x: 1018, y: 220, r: 3 }, { x: 770, y: 362, r: -2.5 }, { x: 150, y: 330, r: 2 },
  { x: 470, y: 22, r: -2 }, { x: 980, y: 22, r: 1.5 },
];

const UNFILED = '__unfiled__';

// ── local UI prefs (theme/texture/motion/behaviour) ─────────────────────────────
const PREFS_KEY = 'sv_app_prefs';
const DEFAULT_PREFS = { theme: 'light', texture: 'grain', reduceMotion: false, confirmTrash: false, autoRestack: true };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }
function applyPrefs() {
  app.dataset.theme = prefs.theme;
  app.dataset.texture = prefs.texture;
  app.dataset.reduce = prefs.reduceMotion ? '1' : '0';
}

// stack positions per shelf (UI-local, the prototype's tactile arrangement)
function loadPos(shelfId) {
  try { return JSON.parse(localStorage.getItem('sv_app_pos:' + shelfId) || '{}'); } catch { return {}; }
}
function savePos(shelfId, map) { try { localStorage.setItem('sv_app_pos:' + shelfId, JSON.stringify(map)); } catch {} }

// ── state ───────────────────────────────────────────────────────────────────────
let prefs = loadPrefs();
let state = { folders: {}, sessions: {}, settings: {}, stats: null, entitlements: { pro: false }, limits: { freeSessionLimit: 50 }, recovery: { available: false } };
let activeShelf = UNFILED;
let query = '';
let spreadId = null;     // session id shown in deal-out overlay
let trashOpen = false;
let settingsOpen = false;
let syncOpen = false;
let proOpen = false;     // upgrade / entitlements modal
let syncMode = 'signin'; // 'signin' | 'signup'
let syncPass = '';       // E2E passphrase, kept in memory only (never persisted)
let syncEmail = '';      // remembered email — prefilled across sign-in/up renders
let confirmEmail = null; // when set, show the "confirm your email" success state
let resetSentEmail = null; // when set, show the "password reset link sent" state

async function loadData() {
  const [folders, sessions, settings, stats, ent, recovery] = await Promise.all([
    api.getFolders(), api.getSessions(), api.getSettings(), api.getStats().catch(() => null),
    api.getEntitlements().catch(() => ({ entitlements: { pro: false }, limits: { freeSessionLimit: 50 } })),
    api.getRecovery().catch(() => ({ available: false })),
  ]);
  state = { folders, sessions, settings, stats, entitlements: ent.entitlements, limits: ent.limits, recovery };
}

// ── entitlements helpers ────────────────────────────────────────────────────────
const isPro = () => !!state.entitlements?.pro;
const freeLimit = () => state.limits?.freeSessionLimit ?? 50;
const savedCount = () => Object.keys(state.sessions).length;
// near = within the last 5 of the cap; full = at/over it
function limitLevel() {
  if (isPro()) return 'pro';
  const n = savedCount(), lim = freeLimit();
  if (n >= lim) return 'full';
  if (n >= lim - 5) return 'near';
  return 'ok';
}

// ── crash-recovery prompt ───────────────────────────────────────────────────────
// The engine peeks the pre-crash candidate via GET_RECOVERY (available only when
// some of those tabs aren't currently open). We surface the banner just then;
// RECOVER_LAST commits it, DISMISS_RECOVERY clears it for this launch.
const recovery = () => state.recovery || { available: false };

// shelves = Unfiled + every folder, each with its sessions
function shelves() {
  const list = [{ id: UNFILED, name: 'Unfiled', color: 'var(--sub)' }];
  for (const f of Object.values(state.folders)) list.push({ id: f.id, name: f.name, color: f.color || colorFor(f.name) });
  return list.map((sh) => ({
    ...sh,
    sessions: Object.values(state.sessions)
      .filter((s) => (s.folderId ?? UNFILED) === sh.id)
      .sort((a, b) => b.createdAt - a.createdAt),
  }));
}
function activeShelfObj() { return shelves().find((s) => s.id === activeShelf) || shelves()[0]; }
function matches(s) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return s.name.toLowerCase().includes(q) ||
    s.tabs.some((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
}

// ── toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null, undoFn = null;
function toast(msg, undo) {
  undoFn = undo || null;
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? `<button id="toast-undo">UNDO</button>` : '');
  el.hidden = false;
  if (undo) $('#toast-undo', el).onclick = async () => { el.hidden = true; clearTimeout(toastTimer); const f = undoFn; undoFn = null; if (f) await f(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

// ── render ──────────────────────────────────────────────────────────────────────
function render() {
  const shs = shelves();
  const active = activeShelfObj();
  const sessions = active.sessions;
  const totalTabs = sessions.reduce((n, s) => n + s.tabs.length, 0);
  const st = state.stats;

  app.innerHTML = `
    <div class="rail">
      <button class="rail-arrow tactile" id="flip-prev" title="Previous shelf">‹</button>
      <div class="rail-tabs" id="rail-tabs">
        ${shs.map((sh) => `
          <button class="tab${sh.id === active.id ? ' on' : ''}" data-shelf="${esc(sh.id)}">
            <span class="dot" style="background:${esc(sh.color)}"></span>${esc(sh.name)}
            <span class="count mono">${sh.sessions.length}</span>
          </button>`).join('')}
        <button class="tab-add" id="add-folder" title="New shelf">+</button>
      </div>
      <button class="rail-arrow tactile" id="flip-next" title="Next shelf">›</button>
    </div>

    <div class="desk">
      <div class="head">
        <div>
          <h1 class="black">SESSIONVAULT</h1>
          <div class="meta mono"><b style="color:${esc(active.color)}">${esc(active.name.toUpperCase())}</b> · ${sessions.length} SESSIONS · ${totalTabs} TABS</div>
        </div>
        <div class="head-actions">
          <div class="searchbox"><span>⌕</span><input id="search" class="mono" placeholder="SEARCH…" value="${esc(query)}" /></div>
          <button class="btn-squash tactile" id="squash">＋ SAVE OPEN TABS</button>
          <div class="limit-chip mono" data-level="${limitLevel()}" id="limit-chip"
               title="${isPro() ? 'Pro — unlimited saved sessions' : `${savedCount()} of ${freeLimit()} free saved sessions`}">
            ${isPro() ? '∞ PRO' : `${savedCount()}<span class="sep">/</span>${freeLimit()}`}
          </div>
          <button class="btn-gear tactile" id="cloud" title="Cloud sync">☁</button>
          <button class="btn-gear tactile" id="gear" title="Settings">⚙</button>
        </div>
      </div>

      ${recovery().available ? `
      <div class="recover-banner" id="recover-banner">
        <span class="rb-ico">↩</span>
        <div class="rb-text">
          <b>Did your browser close unexpectedly?</b>
          <span class="rb-sub mono">${recovery().missingCount} of ${recovery().tabCount} tabs from before aren't open — bring them back.</span>
        </div>
        <span style="flex:1"></span>
        <button class="rb-do tactile" id="recover-do">↩ RECOVER ${recovery().missingCount} TABS</button>
        <button class="rb-x tactile" id="recover-x" title="Dismiss">×</button>
      </div>` : ''}

      <div class="stats-stamp mono">${st ? `${st.totalTabs} TABS KEPT ★ ${st.sessions.total} SESSIONS` : 'SESSIONVAULT'}</div>

      <div class="trash-corner mono" id="trash-corner">
        <span class="big">⌫</span><span>DROP TO DELETE</span>
        <span style="opacity:.6">(${Object.keys(state.sessions).length === 0 ? 0 : ''}BIN)</span>
      </div>

      <div class="stacks slidein" id="stacks" key="${esc(active.id)}">
        ${sessions.map((s, i) => stackHTML(s, i)).join('')}
      </div>

      ${sessions.length === 0 ? `
        <div class="empty">
          <div class="h hand">this shelf is bare</div>
          <div class="b hand">Save your open tabs into a stack with “Save open tabs”.</div>
        </div>` : ''}
    </div>

    <div id="toast" class="toast" hidden></div>
    ${api.USING_MOCK ? '<div class="mock-badge">mock data</div>' : ''}
  `;

  // re-apply persisted positions to each stack
  const pos = loadPos(active.id);
  $('#stacks').querySelectorAll('.stack').forEach((el, i) => {
    const id = el.dataset.id;
    const p = pos[id] || POS[i % POS.length];
    placeStack(el, p);
  });

  wireDesk();
  if (spreadId) renderSpread();
  if (trashOpen) renderTrashOverlay();
  if (settingsOpen) renderSettings();
  if (syncOpen) renderSync();
}

function stackHTML(s, i) {
  const cards = Math.min(3, Math.max(0, s.tabs.length - 1));
  const strip = s.folderId ? (state.folders[s.folderId]?.color || colorFor(s.name)) : colorFor(s.name);
  const dim = !matches(s) ? ' dim' : '';
  return `
    <div class="stack${dim}" data-id="${esc(s.id)}">
      ${Array.from({ length: cards }).map((_, k) =>
        `<div class="face" style="transform:rotate(${(k + 1) * (k % 2 ? 2.2 : -2.4)}deg) translateY(${(k + 1) * 2}px)"></div>`).join('')}
      <div class="face top">
        <div class="strip" style="background:${esc(strip)}"></div>
        <div class="body">
          <div class="title">${esc(s.name)}</div>
          <div class="sub mono">${s.tabs.length} TABS · ${esc(ageOf(s.createdAt).toUpperCase())}</div>
        </div>
        <div class="acts">
          <button class="actbtn" data-act="restore" data-id="${esc(s.id)}">↗ ALL</button>
          <button class="actbtn" data-act="share" data-id="${esc(s.id)}">⤴</button>
          <button class="actbtn" data-act="trash" data-id="${esc(s.id)}">×</button>
        </div>
      </div>
    </div>`;
}

function placeStack(el, p) {
  const rot = prefs.reduceMotion ? 0 : (p.r || 0);
  el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${rot}deg)`;
}

// ── desk events: rail, header, drag+deal, stack actions ─────────────────────────
function wireDesk() {
  // rail
  app.querySelectorAll('[data-shelf]').forEach((b) => b.onclick = () => { activeShelf = b.dataset.shelf; query = ''; render(); });
  $('#flip-prev').onclick = () => flip(-1);
  $('#flip-next').onclick = () => flip(1);
  $('#add-folder').onclick = onAddFolder;

  // header
  $('#search').oninput = (e) => { query = e.target.value; updateDim(); };
  $('#squash').onclick = onSquash;
  $('#gear').onclick = () => { settingsOpen = true; renderSettings(); };
  $('#cloud').onclick = () => { syncOpen = true; renderSync(); };
  $('#trash-corner').onclick = () => { trashOpen = true; renderTrashOverlay(); };

  // crash-recovery banner
  const rdo = $('#recover-do'), rx = $('#recover-x');
  if (rdo) rdo.onclick = onRecover;
  if (rx) rx.onclick = async () => { await api.dismissRecovery(); state.recovery = { available: false }; render(); toast('Recovery dismissed'); };

  // stack action buttons (don't start a drag)
  app.querySelectorAll('.actbtn').forEach((b) => {
    b.onpointerdown = (e) => e.stopPropagation();
    b.onclick = (e) => { e.stopPropagation(); onStackAct(b.dataset.act, b.dataset.id); };
  });

  // drag + deal
  app.querySelectorAll('.stack').forEach(makeDraggable);
}

function flip(d) {
  const shs = shelves();
  const i = shs.findIndex((s) => s.id === activeShelf);
  activeShelf = shs[(i + d + shs.length) % shs.length].id;
  query = ''; render();
}

function updateDim() {
  const active = activeShelfObj();
  const byId = Object.fromEntries(active.sessions.map((s) => [s.id, s]));
  app.querySelectorAll('.stack').forEach((el) => {
    const s = byId[el.dataset.id];
    el.classList.toggle('dim', s ? !matches(s) : false);
  });
}

// drag: move on the desk; tiny move = click = deal out; drop on bin = trash
function makeDraggable(el) {
  let drag = null;
  el.onpointerdown = (e) => {
    if (e.target.closest('.actbtn')) return;
    el.setPointerCapture(e.pointerId);
    const pos = loadPos(activeShelf);
    const cur = pos[el.dataset.id] || POS[[...el.parentNode.children].indexOf(el) % POS.length];
    drag = { sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, r: cur.r || 0, moved: false };
  };
  el.onpointermove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; el.classList.add('drag'); }
    if (drag.moved) {
      const deskRect = $('.desk').getBoundingClientRect();
      const nx = Math.max(8, Math.min(deskRect.width - 244, drag.ox + dx));
      const ny = Math.max(8, Math.min(deskRect.height - 240, drag.oy + dy));
      drag.cur = { x: nx, y: ny, r: drag.r };
      placeStack(el, drag.cur);
      $('#trash-corner').classList.toggle('hot', overTrash(e));
    }
  };
  el.onpointerup = (e) => {
    if (!drag) return;
    const d = drag; drag = null; el.classList.remove('drag');
    if (!d.moved) { spreadId = el.dataset.id; renderSpread(); return; }
    $('#trash-corner').classList.remove('hot');
    if (overTrash(e)) { onStackAct('trash', el.dataset.id, true); return; }
    const pos = loadPos(activeShelf); pos[el.dataset.id] = d.cur; savePos(activeShelf, pos);
  };
}

function overTrash(e) {
  const r = $('#trash-corner').getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

// ── actions ───────────────────────────────────────────────────────────────────
async function onStackAct(act, id, viaDrop) {
  const s = state.sessions[id];
  if (!s) return;
  if (act === 'restore') {
    await api.restoreSession(id);
    toast(`↗ ${s.tabs.length} tabs restored — opening windows`);
    return;
  }
  if (act === 'share') {
    const text = await api.exportSessionText(id);
    try { await navigator.clipboard.writeText(text); } catch {}
    toast('⤴ tab list copied to clipboard');
    return;
  }
  if (act === 'trash') {
    if (prefs.confirmTrash && !viaDrop && !confirm(`Delete “${s.name}” (${s.tabs.length} tabs)?`)) return;
    await api.deleteSession(id);
    spreadId = null;
    await refresh();
    toast(`“${s.name}” moved to the bin`, async () => { await api.restoreFromTrash(id); await refresh(); });
  }
}

async function onRecover() {
  const btn = $('#recover-do'); if (btn) { btn.disabled = true; btn.textContent = '↩ RECOVERING…'; }
  try {
    const s = await api.recoverLast(); // clears the candidate in the engine
    if (s) {
      activeShelf = UNFILED;
      await refresh(); // re-peeks recovery → banner goes away
      toast(`↩ recovered ${s.tabs.length} tabs into a new session`);
    } else {
      await refresh();
      toast('Nothing to recover — no snapshot from a previous session');
    }
  } catch (err) {
    render();
    toast('Could not recover: ' + err.message);
  }
}

async function onSquash() {
  const name = prompt('Name this session:', `Session — ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
  if (name === null) return;
  try {
    const folderId = activeShelf === UNFILED ? null : activeShelf;
    const s = await api.saveSession(name || 'Open tabs', folderId);
    if (s && folderId && s.folderId !== folderId) await api.moveSessionToFolder(s.id, folderId);
    await refresh();
    toast('✓ open tabs saved as a new session');
  } catch (err) {
    if (String(err.message).startsWith('FREE_LIMIT_REACHED')) toast('Free limit reached (50). Delete some or upgrade to Pro.');
    else toast('Could not save: ' + err.message);
  }
}

async function onAddFolder() {
  const name = prompt('New shelf name:');
  if (!name || !name.trim()) return;
  const f = await api.createFolder(name.trim(), colorFor(name));
  await refresh();
  if (f) activeShelf = f.id;
  render();
}

async function refresh() { await loadData(); render(); }

// ── deal-out spread overlay ─────────────────────────────────────────────────────
function renderSpread() {
  const s = state.sessions[spreadId];
  if (!s) { spreadId = null; return; }
  const strip = s.folderId ? (state.folders[s.folderId]?.color || colorFor(s.name)) : colorFor(s.name);
  let ov = $('#overlay-spread');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-spread'; ov.className = 'overlay'; app.appendChild(ov); }
  ov.innerHTML = `
    <div class="overlay-head" data-stop>
      <span class="overlay-title black" style="border-bottom:6px solid ${esc(strip)}">${esc(s.name)}</span>
      <span class="overlay-sub mono">${s.tabs.length} cards dealt</span>
      <span style="flex:1"></span>
      <button class="actbtn" data-sp="restore">↗ RESTORE ALL</button>
      <button class="actbtn" data-sp="share">⤴ SHARE</button>
      <button class="actbtn" data-sp="trash">× BIN IT</button>
      <button class="actbtn" data-sp="close">RESTACK ↩</button>
    </div>
    <div class="cards" data-stop>
      ${s.tabs.map((tb, i) => `
        <div class="card" style="animation-delay:${i * 0.04}s; transform:rotate(${(i % 3) - 1}deg)">
          <div class="strip" style="background:${esc(colorFor(domainOf(tb.url)))}"></div>
          <div class="ctitle">${esc(tb.title || domainOf(tb.url))}</div>
          <div class="crow">
            <span class="cdom mono">${esc(domainOf(tb.url))}</span>
            <span class="cdacts"><button class="ico" data-open="${esc(tb.url)}" title="Open this tab">↗</button></span>
          </div>
        </div>`).join('')}
    </div>
    <div class="mono" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);font-size:10px;letter-spacing:.2em;color:var(--sub)">CLICK ANYWHERE TO RESTACK</div>
  `;
  ov.hidden = false;
  ov.onpointerdown = (e) => { ov._downSelf = (e.target === ov); };
  ov.onclick = (e) => { if (ov._downSelf && !e.target.closest('[data-stop]')) closeSpread(); };
  ov.querySelectorAll('[data-sp]').forEach((b) => b.onclick = async () => {
    const a = b.dataset.sp;
    if (a === 'close') return closeSpread();
    if (a === 'restore' || a === 'share' || a === 'trash') { await onStackAct(a, s.id); if (a !== 'trash') closeSpread(); }
  });
  ov.querySelectorAll('[data-open]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation(); await api.restoreTab(b.dataset.open); toast('↗ tab opened');
  });
}
function closeSpread() { spreadId = null; const ov = $('#overlay-spread'); if (ov) ov.remove(); }

// ── trash overlay ───────────────────────────────────────────────────────────────
async function renderTrashOverlay() {
  const trash = await api.getTrash();
  const entries = Object.values(trash).sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
  let ov = $('#overlay-trash');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-trash'; ov.className = 'overlay'; app.appendChild(ov); }
  ov.innerHTML = `
    <div class="overlay-head" data-stop>
      <span class="overlay-title black">THE BIN</span>
      <span class="overlay-sub mono">${entries.length} sessions deleted</span>
      <span style="flex:1"></span>
      ${entries.length ? '<button class="actbtn" data-tr="empty">EMPTY FOR GOOD</button>' : ''}
      <button class="actbtn" data-tr="close">BACK ↩</button>
    </div>
    <div class="cards" data-stop>
      ${entries.length === 0 ? '<div class="hand" style="font-size:34px;opacity:.5">Bin is empty.</div>' : ''}
      ${entries.map((s, i) => `
        <div class="trash-card" style="animation-delay:${i * 0.04}s; transform:rotate(${(i % 3) - 1}deg)">
          <div class="tname black">${esc(s.name)}</div>
          <div class="mono" style="font-size:9px;letter-spacing:.12em;color:var(--sub);flex:1">${s.tabs.length} TABS</div>
          <button class="actbtn" style="align-self:flex-start" data-putback="${esc(s.id)}">↩ RESTORE</button>
        </div>`).join('')}
    </div>`;
  ov.hidden = false;
  ov.onpointerdown = (e) => { ov._downSelf = (e.target === ov); };
  ov.onclick = (e) => { if (ov._downSelf && !e.target.closest('[data-stop]')) closeTrash(); };
  ov.querySelectorAll('[data-tr]').forEach((b) => b.onclick = async () => {
    if (b.dataset.tr === 'close') return closeTrash();
    if (b.dataset.tr === 'empty') { await api.emptyTrash(); renderTrashOverlay(); toast('Bin emptied'); }
  });
  ov.querySelectorAll('[data-putback]').forEach((b) => b.onclick = async () => {
    await api.restoreFromTrash(b.dataset.putback); await loadData(); renderTrashOverlay(); render(); renderTrashOverlay();
    toast('restored to the shelf');
  });
}
function closeTrash() { trashOpen = false; const ov = $('#overlay-trash'); if (ov) ov.remove(); }

// ── settings overlay ─────────────────────────────────────────────────────────────
function renderSettings() {
  const s = state.settings;
  let ov = $('#overlay-settings');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-settings'; ov.className = 'modal-center'; app.appendChild(ov); }
  const seg = (key, opts) => `<div class="seg">${opts.map((o) => `<button class="${prefs[key] === o ? 'on' : ''}" data-seg="${key}" data-val="${o}">${o}</button>`).join('')}</div>`;
  const toggle = (key, on) => `<button class="toggle ${on ? 'on' : ''}" data-toggle="${key}"><i></i></button>`;
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <span class="black" style="font-size:34px">SETTINGS</span>
        <span style="flex:1"></span>
        <button class="actbtn" data-replay>↻ REPLAY INTRO</button>
        <button class="actbtn" data-done>DONE ↩</button>
      </div>

      <div class="set-section mono">APPEARANCE</div>
      <div class="set-row"><div class="label"><div class="l">Theme</div><div class="h mono">Light desk or midnight desk</div></div>${seg('theme', ['light', 'dark'])}</div>
      <div class="set-row"><div class="label"><div class="l">Desk texture</div><div class="h mono">The grain under your stacks</div></div>${seg('texture', ['grain', 'linen', 'clean'])}</div>
      <div class="set-row"><div class="label"><div class="l">Reduce motion</div><div class="h mono">Calm the springs and shuffles</div></div>${toggle('reduceMotion', prefs.reduceMotion)}</div>

      <div class="set-section mono">BEHAVIOUR</div>
      <div class="set-row"><div class="label"><div class="l">Confirm before binning</div><div class="h mono">Ask first when you delete a stack</div></div>${toggle('confirmTrash', prefs.confirmTrash)}</div>
      <div class="set-row"><div class="label"><div class="l">Autosave open tabs</div><div class="h mono">Periodically snapshot your tabs (Pro)</div></div>${toggle('autosaveEnabled', !!s.autosaveEnabled)}</div>
      <div class="set-row"><div class="label"><div class="l">Autosave interval</div><div class="h mono">Minutes between snapshots</div></div><input class="num mono" id="set-interval" type="number" min="1" max="1440" value="${esc(s.autosaveInterval ?? 10)}" /></div>
      <div class="set-row"><div class="label"><div class="l">Keep autosaves</div><div class="h mono">How many snapshots to retain</div></div><input class="num mono" id="set-maxauto" type="number" min="1" max="100" value="${esc(s.maxAutoSessions ?? 5)}" /></div>
    </div>`;
  ov.hidden = false;
  ov.onpointerdown = (e) => { ov._downSelf = (e.target === ov); };
  ov.onclick = (e) => { if (ov._downSelf && e.target === ov) closeSettings(); };
  $('[data-done]', ov).onclick = closeSettings;
  $('[data-replay]', ov).onclick = () => { closeSettings(); renderOnboarding(); };
  ov.querySelectorAll('[data-seg]').forEach((b) => b.onclick = () => { prefs[b.dataset.seg] = b.dataset.val; savePrefs(); applyPrefs(); renderSettings(); });
  ov.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
    const key = b.dataset.toggle;
    if (key === 'autosaveEnabled') {
      const next = !state.settings.autosaveEnabled;
      state.settings = await api.updateSettings({ autosaveEnabled: next });
    } else { prefs[key] = !prefs[key]; savePrefs(); applyPrefs(); }
    renderSettings();
  });
  const commitNum = async () => {
    state.settings = await api.updateSettings({
      autosaveInterval: Math.max(1, Number($('#set-interval', ov).value) || 1),
      maxAutoSessions: Math.max(1, Number($('#set-maxauto', ov).value) || 1),
    });
  };
  $('#set-interval', ov).onchange = commitNum;
  $('#set-maxauto', ov).onchange = commitNum;
}
function closeSettings() { settingsOpen = false; const ov = $('#overlay-settings'); if (ov) { ov.remove(); } render(); }

// ── cloud sync panel ─────────────────────────────────────────────────────────────
const STRENGTH_COLORS = ['#C4524E', '#C4524E', '#D9A431', '#2D9D78', '#2D9D78'];

async function renderSync() {
  const status = await api.getSyncStatus() || { enabled: false };
  let ov = $('#overlay-sync');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-sync'; ov.className = 'modal-center'; app.appendChild(ov); }

  const errLine = status.error ? `<div class="sync-err mono">${esc(status.error)}</div>` : '';
  let body;
  if (!status.enabled) {
    // After a successful Create account, Supabase sends a confirmation link and
    // returns no session yet — that's a SUCCESS, not an error. Show a friendly
    // (non-red) block, with the account's email prefilled for the next sign-in.
    const confirmBlock = confirmEmail ? `
      <div class="sync-info">
        <span class="si-ico">✉</span>
        <div class="si-text">
          <b>Almost there — confirm your email</b>
          <span class="si-body">We sent a link to <b>${esc(confirmEmail)}</b>. Open it, tap “Confirm email”, then sign in.</span>
          <span class="si-hint mono">Don't see it? Check Spam and Promotions — it can take a minute to arrive.</span>
          <button class="si-resend mono" id="sync-resend">↻ Resend email</button>
        </div>
      </div>` : '';
    // Forgot-password success: Supabase accepted the reset request and (if the
    // account exists) emailed a link. Friendly, non-red — mirrors confirmBlock.
    const resetBlock = resetSentEmail ? `
      <div class="sync-info">
        <span class="si-ico">🔑</span>
        <div class="si-text">
          <b>Check your inbox</b>
          <span class="si-body">We sent a password-reset link to <b>${esc(resetSentEmail)}</b>. Open it to set a new password, then sign in here.</span>
          <span class="si-hint mono">No email? Check Spam — and make sure it's the address you signed up with.</span>
        </div>
      </div>` : '';
    const isSignup = syncMode === 'signup';
    // Sign-up only: confirm the password to catch typos before the account exists.
    // Always in the DOM (so it can animate); revealed once the password is typed.
    const confirmPwInput = isSignup ? `
      <div class="pw2-wrap" id="pw2-wrap">
        <div class="pw2-inner">
          <input id="sync-pw2" class="sync-input mono" type="password" placeholder="confirm password" autocomplete="new-password" />
        </div>
      </div>` : '';
    // Sign-in only: a way out when the account password is forgotten.
    const forgotLink = !isSignup ? `
      <div class="sync-foot mono" style="margin-top:8px">
        <button class="sync-link" id="sync-forgot">Forgot password?</button>
      </div>` : '';
    body = `
      <div class="set-section mono">${isSignup ? 'CREATE ACCOUNT' : 'SIGN IN'}</div>
      ${confirmBlock}
      ${resetBlock}
      <input id="sync-email" class="sync-input mono" type="email" placeholder="email" autocomplete="username" value="${esc(syncEmail)}" />
      <div class="sync-pw-wrap">
        <input id="sync-pw" class="sync-input mono has-reveal" type="password" placeholder="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
        <button type="button" class="pw-reveal" id="sync-pw-reveal" aria-label="Show password" title="Show password">${EYE_SHOW}</button>
      </div>
      <div class="sync-warn mono" id="sync-pw-warn" hidden>Use only English letters, numbers and symbols — no spaces, accents or non-Latin characters.</div>
      ${confirmPwInput}
      ${forgotLink}
      ${errLine}
      <button class="btn-squash tactile" id="sync-connect" style="width:100%;margin-top:12px;transform:none">
        ${isSignup ? 'CREATE ACCOUNT & CONNECT' : 'SIGN IN & CONNECT'}
      </button>
      <div class="sync-foot mono">
        ${isSignup ? 'Have an account?' : 'New here?'}
        <button class="sync-link" id="sync-toggle">${isSignup ? 'Sign in' : 'Create one'}</button>
      </div>
      <div class="sync-foot mono" style="opacity:.6">End-to-end encrypted. Your passphrase never leaves this device.</div>`;
  } else {
    const a = await api.assessPassphrase(syncPass);
    const segs = Array.from({ length: 4 }).map((_, i) =>
      `<span style="background:${i < a.score ? STRENGTH_COLORS[a.score] : 'var(--paperEdge)'}"></span>`).join('');
    body = `
      <div class="set-row"><div class="label"><div class="l">Signed in</div><div class="h mono">${esc(status.email || '')}</div></div>
        <button class="actbtn" id="sync-out">SIGN OUT</button></div>
      <div class="set-section mono">ENCRYPTION PASSPHRASE</div>
      <input id="sync-pass" class="sync-input mono" type="password" placeholder="passphrase (same on every device)" value="${esc(syncPass)}" autocomplete="off" />
      <div class="pp-bar" id="pp-bar">${segs}</div>
      <div class="pp-label mono" id="pp-label">${syncPass ? esc(a.label) + (a.warnings[0] ? ' — ' + esc(a.warnings[0]) : '') : 'used to encrypt your vault before it leaves the device'}</div>
      ${errLine}
      <button class="btn-squash tactile" id="sync-now" style="width:100%;margin-top:14px;transform:none">⟳ SYNC NOW</button>
      <div class="sync-foot mono">${status.lastSync ? 'Last synced ' + esc(ageOf(status.lastSync)) : 'Not synced yet'} · ${esc(status.state)}</div>`;
  }

  ov.innerHTML = `<div class="modal" style="width:420px">
      <div class="modal-head"><span class="black" style="font-size:30px">CLOUD SYNC</span><span style="flex:1"></span><button class="actbtn" data-done>DONE ↩</button></div>
      ${body}
    </div>`;
  ov.hidden = false;
  ov.onpointerdown = (e) => { ov._downSelf = (e.target === ov); };
  ov.onclick = (e) => { if (ov._downSelf && e.target === ov) closeSync(); };
  $('[data-done]', ov).onclick = closeSync;

  if (!status.enabled) {
    $('#sync-email', ov).oninput = (e) => { syncEmail = e.target.value; };
    $('#sync-toggle', ov).onclick = () => { syncMode = syncMode === 'signup' ? 'signin' : 'signup'; confirmEmail = null; resetSentEmail = null; renderSync(); };
    const forgot = $('#sync-forgot', ov);
    if (forgot) forgot.onclick = async () => {
      const email = $('#sync-email', ov).value.trim();
      if (!email) return toast('Enter your email first');
      syncEmail = email;
      forgot.disabled = true; forgot.textContent = 'Sending…';
      try {
        await api.recoverPassword(email);
        confirmEmail = null; resetSentEmail = email;
        renderSync();
      } catch (err) {
        toast(String(err.message).replace(/^AUTH_FAILED:\s*/, '') || 'Could not send reset email');
        forgot.disabled = false; forgot.textContent = 'Forgot password?';
      }
    };

    // password field: reveal toggle + non-ASCII guard, and on sign-up slide the
    // "confirm password" field in once typing starts — all on one input handler.
    const pw = $('#sync-pw', ov);
    const pwWarn = $('#sync-pw-warn', ov);
    const reveal = $('#sync-pw-reveal', ov);
    const pw2wrap = $('#pw2-wrap', ov);
    reveal.onclick = () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      reveal.innerHTML = show ? EYE_HIDE : EYE_SHOW;
      reveal.title = reveal.ariaLabel = show ? 'Hide password' : 'Show password';
      pw.focus();
    };
    const syncPwUi = () => {
      pwWarn.hidden = !hasBadChar(pw.value);
      if (pw2wrap) pw2wrap.classList.toggle('show', pw.value.length > 0);
    };
    pw.oninput = syncPwUi;
    syncPwUi(); // handle re-renders where the password is already filled

    const resend = $('#sync-resend', ov);
    if (resend) resend.onclick = async () => {
      resend.disabled = true; resend.textContent = '↻ Sending…';
      try { await api.resendConfirmation(confirmEmail); toast('✉ confirmation email sent again'); }
      catch { toast('Could not resend right now — try again in a minute'); }
      finally { resend.disabled = false; resend.textContent = '↻ Resend email'; }
    };
    $('#sync-connect', ov).onclick = async () => {
      const email = $('#sync-email', ov).value.trim();
      const password = $('#sync-pw', ov).value;
      if (!email || !password) return toast('Enter email and password');
      if (hasBadChar(password)) { pwWarn.hidden = false; pw.focus(); return; }
      if (syncMode === 'signup') {
        // Confirm-password guard: catch typos before the account is created.
        if (password.length < 6) return toast('Password must be at least 6 characters');
        if (password !== $('#sync-pw2', ov).value) return toast('Passwords don’t match');
      }
      syncEmail = email;
      try {
        await api.setSyncEnabled(true, { email, password, signUp: syncMode === 'signup' });
        confirmEmail = null; resetSentEmail = null;
        toast('☁ connected');
        renderSync();
      } catch (err) {
        if (String(err.message).startsWith('AUTH_CONFIRM_REQUIRED')) {
          // Success path: account created, email on its way. Switch to sign-in,
          // keep the email prefilled, and surface the friendly confirm block.
          confirmEmail = email;
          syncMode = 'signin';
          renderSync();
        } else {
          await api.getSyncStatus();
          renderSyncError(err.message);
        }
      }
    };
  } else {
    const pp = $('#sync-pass', ov);
    pp.oninput = async () => {
      syncPass = pp.value;
      const a = await api.assessPassphrase(syncPass);
      $('#pp-bar', ov).innerHTML = Array.from({ length: 4 }).map((_, i) =>
        `<span style="background:${i < a.score ? STRENGTH_COLORS[a.score] : 'var(--paperEdge)'}"></span>`).join('');
      $('#pp-label', ov).textContent = syncPass ? a.label + (a.warnings[0] ? ' — ' + a.warnings[0] : '') : 'used to encrypt your vault before it leaves the device';
    };
    $('#sync-out', ov).onclick = async () => { await api.setSyncEnabled(false); syncPass = ''; renderSync(); };
    $('#sync-now', ov).onclick = async () => {
      if (!syncPass) return toast('Enter your passphrase first');
      $('#sync-now', ov).textContent = '⟳ SYNCING…';
      const st = await api.syncNow(syncPass);
      await loadData(); render(); renderSync();
      toast(st && st.error ? 'Sync failed: ' + st.error : '☁ vault synced');
    };
  }
}
function renderSyncError(msg) { const ov = $('#overlay-sync'); if (!ov) return; const m = ov.querySelector('.modal'); const e = document.createElement('div'); e.className = 'sync-err mono'; e.textContent = msg; m.appendChild(e); }
function closeSync() { syncOpen = false; const ov = $('#overlay-sync'); if (ov) ov.remove(); }

// ── onboarding (first run; scroll-driven narrative, replayable from settings) ────
// UX from the SessionVault Prototype handoff (5 sections: hero · 3 steps · CTA,
// scroll-snapped with word-by-word reveal + parallax art), reskinned to our
// design language (manila cards, ink, Archivo/Space Mono).
const ONB_KEY = 'sv_app_onboarded';
const ONB_SECTIONS = 5;
const ONB_TAGS = [
  { label: 'work', c: '#2D9D78', x: -120, y: -64, r: -10 },
  { label: 'research', c: '#3A86C8', x: 122, y: -48, r: 8 },
  { label: 'personal', c: '#E8744F', x: -104, y: 66, r: 6 },
  { label: 'reading', c: '#7B6CF6', x: 112, y: 70, r: -7 },
];
const CARD_STRIPS = ['#2D9D78', '#E8744F', '#7B6CF6', '#D9A431', '#3A86C8'];
const DEV_GLYPHS = {
  laptop: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M2 20h20"/></svg>',
  desktop: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M9 21h6M12 17v4"/></svg>',
  phone: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg>',
};
const CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>';
// stacked-documents glyph for the sync hub — same line-art weight as DEV_GLYPHS
const DOC_GLYPH = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="11" height="14" rx="2"/><path d="M5 7v11a2 2 0 0 0 2 2h8"/></svg>';
// password reveal glyphs (eye / eye-off)
const EYE_SHOW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_HIDE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.3 4.1"/><path d="M6.6 6.6A17.5 17.5 0 0 0 2 12s3.5 7 10 7a10.3 10.3 0 0 0 3.7-.7"/></svg>';
// allowed = printable ASCII except space; flag spaces, accented/non-Latin & control chars
const hasBadChar = (s) => /[^\x21-\x7E]/.test(s || '');

// staggered word-reveal spans (\n → line break)
function onbWords(text, base = 0, step = 60) {
  let n = -1;
  return text.split('\n').map((line) =>
    `<span class="onb-wline">${line.split(' ').map((w) => { n++; return `<span class="onb-word" style="--d:${base + n * step}ms">${esc(w)}</span>`; }).join(' ')}</span>`,
  ).join('');
}

function onbCard(i, mode) {
  const d = i - 2;
  const tf = mode === 'fan'
    ? `translate(-50%,-50%) translate(${d * 58}px, ${Math.abs(d) * 12 - 18}px) rotate(${d * 9}deg)`
    : `translate(-50%,-50%) translateY(${d * 8}px) scale(${1 - Math.abs(d) * 0.06})`;
  const op = mode === 'fan' ? 1 : (i === 2 ? 1 : 0.5);
  return `<div class="onb-card" style="transform:${tf};opacity:${op};z-index:${10 - Math.abs(d)}">
    <div class="cstrip" style="background:${CARD_STRIPS[i]}"></div>
    <div class="clines"><div class="onb-line a" style="background:${CARD_STRIPS[i]}"></div><div class="onb-line"></div><div class="onb-line" style="width:55%"></div></div>
  </div>`;
}
function onbArt(kind) {
  const mode = kind === 'fan' ? 'fan' : 'stack';
  const cards = [0, 1, 2, 3, 4].map((i) => onbCard(i, mode)).join('');
  let extra = '';
  if (kind === 'tags') {
    extra = `<div class="onb-layer">${ONB_TAGS.map((tg, i) => `<span class="onb-tag" style="color:${tg.c};border-color:color-mix(in srgb, ${tg.c} 45%, transparent);transform:translate(-50%,-50%) translate(${tg.x}px,${tg.y}px) rotate(${tg.r}deg);animation-delay:${150 + i * 90}ms"><span class="d" style="background:${tg.c}"></span>${tg.label}</span>`).join('')}</div>`;
  } else if (kind === 'devices') {
    extra = `<div class="onb-layer onb-devrow">${Object.keys(DEV_GLYPHS).map((k, i) => `<div class="onb-dev" style="animation-delay:${i * 110}ms"><div class="glyph">${DEV_GLYPHS[k]}</div><span class="onb-check">${CHECK}</span></div>`).join('')}</div>`;
  }
  return `<div class="onb-art"><div class="onb-art-inner">${cards}${extra}</div></div>`;
}

// cursor pointer model (restyled to ink/paper) for the collect scene
const CURSOR_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3 L18 11.5 L12.5 12.8 L15.4 19.2 L12.8 20.4 L9.9 14 L6 17 Z" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round"/></svg>';

// one small "tab card" — same manila/ink look as .onb-card, smaller, var-positioned
function onbMiniCard(color, vars, cls = '') {
  return `<div class="onb-card scatter ${cls}" style="${vars}">
    <div class="cstrip" style="background:${color}"></div>
    <div class="clines"><div class="onb-line a" style="background:${color}"></div><div class="onb-line"></div><div class="onb-line" style="width:55%"></div></div>
  </div>`;
}

// ── 01: tabs scattered around a "Click" zone → gather into a stack when active ──
function onbArtCollect() {
  const spots = [[20, 16, -9], [52, 9, 6], [82, 20, -4], [88, 49, 8], [78, 83, -7], [48, 92, 3], [16, 73, 7], [12, 44, -6]];
  const cards = spots.map(([x, y, r], i) =>
    onbMiniCard(CARD_STRIPS[i % CARD_STRIPS.length],
      `--x:${x}%;--y:${y}%;--r:${r}deg;--i:${i - 3.5};--d:${i * 40}ms;z-index:${i}`)).join('');
  return `<div class="onb-art onb-collect">
    <div class="onb-art-inner">
      ${cards}
      <div class="onb-clickzone"><span class="halo"></span><span class="zlabel mono">CLICK</span></div>
      <span class="onb-cursor">${CURSOR_SVG}</span>
      <div class="onb-collected mono"><span class="onb-check">${CHECK}</span>collected</div>
    </div></div>`;
}

// ── 02: scattered cards auto-sort into two tag groups when active ──
function onbArtSort() {
  const A = '#2D9D78', B = '#3A86C8';
  // each card: scatter (--sx/--sy/--r) → group column (--gx/--gy)
  const cards = [
    { c: A, s: [8, 14, -7], g: [27, 40] }, { c: B, s: [60, 8, 6], g: [73, 40] },
    { c: A, s: [82, 22, -4], g: [27, 62] }, { c: B, s: [14, 64, 6], g: [73, 62] },
    { c: A, s: [50, 78, -5], g: [27, 84] }, { c: B, s: [80, 60, 8], g: [73, 84] },
  ].map((cd, i) => onbMiniCard(cd.c,
    `--sx:${cd.s[0]}%;--sy:${cd.s[1]}%;--r:${cd.s[2]}deg;--gx:${cd.g[0]}%;--gy:${cd.g[1]}%;--d:${i * 50}ms;z-index:${i}`,
    'sortable')).join('');
  const tags = [{ c: A, x: 27, k: 'work' }, { c: B, x: 73, k: 'research' }].map((g, i) =>
    `<span class="onb-tag onb-sort-tag" style="left:${g.x}%;top:6%;color:${g.c};border-color:color-mix(in srgb, ${g.c} 45%, transparent);--d:${350 + i * 80}ms"><span class="d" style="background:${g.c}"></span>${g.k}</span>`).join('');
  return `<div class="onb-art onb-sort">
    <div class="onb-art-inner">${tags}${cards}</div></div>`;
}

// ── 03: hub breathes, sync dots travel to devices, tiles bump on arrival ──
function onbArtSync() {
  const cx = 190, cy = 44;
  const devs = [{ k: 'laptop', left: 52, top: 170 }, { k: 'desktop', left: 163, top: 180 }, { k: 'phone', left: 274, top: 170 }];
  const ctr = (d) => [d.left + 27, d.top + 27];
  const lines = devs.map((d) => { const [x, y] = ctr(d); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--paperEdge)" stroke-width="1.5" stroke-dasharray="5 6"/>`; }).join('');
  const dots = devs.map((d, i) => { const [x, y] = ctr(d); return `<span class="onb-syncdot" style="--tx:${x - cx}px;--ty:${y - cy}px;--delay:${i * 0.55}s"></span>`; }).join('');
  const tiles = devs.map((d, i) => `<div class="onb-syncdev" style="left:${d.left}px;top:${d.top}px;--delay:${i * 0.55}s">${DEV_GLYPHS[d.k]}</div>`).join('');
  return `<div class="onb-art onb-sync">
    <div class="onb-art-inner">
      <svg class="onb-sync-lines" viewBox="0 0 380 240" width="380" height="240" aria-hidden="true">${lines}</svg>
      <div class="onb-synchub"><span class="pulse"></span><span class="hub-mark">${DOC_GLYPH}</span></div>
      ${dots}${tiles}
    </div></div>`;
}

function renderOnboarding() {
  let ov = $('#overlay-onb');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-onb'; ov.className = 'onb-overlay'; app.appendChild(ov); }

  const step = (num, title, body, art) => `
    <div class="onb-sec onb-sec-step">
      <div class="onb-step-text">
        <div class="onb-num mono">${num}</div>
        <h2 class="onb-h2">${onbWords(title, 180, 55)}</h2>
        <p class="onb-sub onb-r" style="--d:420ms">${esc(body)}</p>
      </div>
      <div class="onb-r onb-step-art" style="--d:260ms">${art}</div>
    </div>`;

  ov.innerHTML = `
    <div class="onb-track">
      <div class="onb-stage">
        <div class="onb-sec onb-sec-hero">
          <div>
            <div class="onb-micro mono onb-r" style="--d:0ms">SESSIONVAULT — TAB MANAGER</div>
            <h1 class="onb-h1">${onbWords('A thousand tabs.\nOne vault.', 120, 75)}</h1>
            <p class="onb-sub onb-r" style="--d:520ms; margin-inline:auto">SessionVault collapses your open tabs into tidy sessions — and brings them back in one click.</p>
            <div class="onb-r" style="--d:680ms; margin-top:18px">${onbArt('fan')}</div>
          </div>
        </div>
        ${step('01', 'One click — then silence', 'SessionVault collapses all your open tabs into tidy sessions — and brings them back in one click. Let your browser breathe.', onbArtCollect())}
        ${step('02', 'Order finds itself', 'Tags, search and folders. Drag sessions around the desk and file them into shelves like cards on a board.', onbArtSort())}
        ${step('03', 'Everywhere you go', 'Sessions sync, end-to-end encrypted, across your devices. Home, work, on the road — your vault is always at hand.', onbArtSync())}
        <div class="onb-sec onb-sec-cta">
          <div class="onb-cta-inner">
            <div class="onb-wordmark mono onb-r" style="--d:40ms">SESSIONVAULT</div>
            <h2 class="onb-h1">${onbWords('Get started?', 140, 80)}</h2>
            <button class="onb-next onb-r" id="onb-start" style="--d:480ms">Get started →</button>
          </div>
        </div>
      </div>
    </div>

    <div class="onb-logo mono">SESSIONVAULT</div>
    <button class="onb-skip" id="onb-skip">Skip</button>
    <div class="onb-rail mono"><span id="onb-rail-cur">01</span><span class="bar"><i id="onb-rail-fill"></i></span><span>0${ONB_SECTIONS}</span></div>
    <div class="onb-hint mono" id="onb-hint"><span class="line"></span> scroll to discover more</div>
  `;
  ov.hidden = false;

  const secs = [...ov.querySelectorAll('.onb-sec')];
  const setActive = (n) => {
    secs.forEach((el, i) => {
      el.classList.toggle('active', i === n);
      el.classList.toggle('off-above', i < n);
      el.classList.toggle('off-below', i > n);
      // drive each section's art animation
      const art = el.querySelector('.onb-art');
      if (!art) return;
      clearTimeout(art._playTimer);
      if (i !== n) { art.classList.remove('playing'); return; }   // reset on leave
      if (art.classList.contains('onb-collect')) {
        art.classList.remove('playing');                         // 01: wait for the user to click
      } else if (art.classList.contains('onb-sort')) {
        art._playTimer = setTimeout(() => {                      // 02: auto-sort a beat after arriving
          if (el.classList.contains('active')) art.classList.add('playing');
        }, 900);
      } else {
        art.classList.add('playing');                            // 03 sync + hero: play immediately
      }
    });
    $('#onb-rail-cur', ov).textContent = String(Math.min(n + 1, ONB_SECTIONS)).padStart(2, '0');
    $('#onb-rail-fill', ov).style.width = `${(n / (ONB_SECTIONS - 1)) * 100}%`;
    $('#onb-hint', ov).style.opacity = n >= ONB_SECTIONS - 1 ? '0' : '1';
  };

  const onScroll = () => {
    const h = ov.clientHeight || 1;
    const step = h * 0.5; // 50vh per section — matches the 300vh .onb-track (2× faster)
    setActive(Math.max(0, Math.min(ONB_SECTIONS - 1, Math.round(ov.scrollTop / step))));
  };
  const onMove = (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    ov.style.setProperty('--par-x', `${x * 14}px`);
    ov.style.setProperty('--par-y', `${y * 14}px`);
  };
  ov.addEventListener('scroll', onScroll, { passive: true });
  ov.addEventListener('mousemove', onMove);
  ov.scrollTop = 0; setActive(0);

  // 01 collect is click-driven: tapping the Click button / canvas gathers the tabs
  const collectArt = ov.querySelector('.onb-collect');
  if (collectArt) collectArt.onclick = () => collectArt.classList.toggle('playing');

  $('#onb-skip', ov).onclick = finishOnboarding;
  $('#onb-start', ov).onclick = finishOnboarding;
}

function finishOnboarding() {
  try { localStorage.setItem(ONB_KEY, '1'); } catch {}
  const ov = $('#overlay-onb'); if (ov) ov.remove();
}

// ── global keys ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#overlay-spread')) return closeSpread();
    if ($('#overlay-trash')) return closeTrash();
    if ($('#overlay-settings')) return closeSettings();
    if ($('#overlay-sync')) return closeSync();
    if ($('#overlay-onb')) return finishOnboarding();
  }
  if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault(); const s = $('#search'); if (s) s.focus();
  }
});

// ── boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
  applyPrefs();
  await loadData();
  render();
  let onboarded = '1';
  try { onboarded = localStorage.getItem(ONB_KEY); } catch {}
  if (!onboarded) renderOnboarding();
})();
