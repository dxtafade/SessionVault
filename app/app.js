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
        <button class="tab-add mono" id="add-folder" title="New shelf">＋</button>
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
  ov.onclick = (e) => { if (!e.target.closest('[data-stop]')) closeSpread(); };
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
  ov.onclick = (e) => { if (!e.target.closest('[data-stop]')) closeTrash(); };
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
  ov.onclick = (e) => { if (e.target === ov) closeSettings(); };
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
    body = `
      <div class="set-section mono">${syncMode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}</div>
      <input id="sync-email" class="sync-input mono" type="email" placeholder="email" autocomplete="username" />
      <input id="sync-pw" class="sync-input mono" type="password" placeholder="password" autocomplete="current-password" />
      ${errLine}
      <button class="btn-squash tactile" id="sync-connect" style="width:100%;margin-top:12px;transform:none">
        ${syncMode === 'signup' ? 'CREATE ACCOUNT & CONNECT' : 'SIGN IN & CONNECT'}
      </button>
      <div class="sync-foot mono">
        ${syncMode === 'signup' ? 'Have an account?' : 'New here?'}
        <button class="sync-link" id="sync-toggle">${syncMode === 'signup' ? 'Sign in' : 'Create one'}</button>
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
  ov.onclick = (e) => { if (e.target === ov) closeSync(); };
  $('[data-done]', ov).onclick = closeSync;

  if (!status.enabled) {
    $('#sync-toggle', ov).onclick = () => { syncMode = syncMode === 'signup' ? 'signin' : 'signup'; renderSync(); };
    $('#sync-connect', ov).onclick = async () => {
      const email = $('#sync-email', ov).value.trim();
      const password = $('#sync-pw', ov).value;
      if (!email || !password) return toast('Enter email and password');
      try {
        await api.setSyncEnabled(true, { email, password, signUp: syncMode === 'signup' });
        toast('☁ connected');
        renderSync();
      } catch (err) { await api.getSyncStatus(); renderSyncError(err.message); }
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

// ── onboarding (first run; 3 steps, replayable from settings) ───────────────────
const ONB_KEY = 'sv_app_onboarded';
const ONB_STEPS = [
  { title: 'A thousand tabs.\nOne vault.', body: 'SessionVault collapses your open tabs into tidy sessions — and brings them back in one click. Let your browser breathe.' },
  { title: 'Order finds\nitself.', body: 'Tags, search and folders. Drag sessions around the desk and file them into shelves like cards on a board.' },
  { title: 'Everywhere\nyou go.', body: 'Sessions sync, end-to-end encrypted, across your devices. Home, work, on the road — your vault is always at hand.' },
];
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

function renderOnboarding() {
  let ov = $('#overlay-onb');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-onb'; ov.className = 'modal-center'; app.appendChild(ov); }
  ov.innerHTML = `
    <div class="modal onb-modal" style="transform:rotate(-.4deg)">
      <div class="onb-wordmark">SESSIONVAULT</div>
      <div class="onb-stage" id="onb-stage">
        ${[0, 1, 2, 3, 4].map((i) => `
          <div class="onb-card" data-i="${i}">
            <div class="cstrip" style="background:${CARD_STRIPS[i]}"></div>
            <div class="clines"><div class="onb-line a" style="background:${CARD_STRIPS[i]}"></div><div class="onb-line"></div><div class="onb-line" style="width:55%"></div></div>
          </div>`).join('')}
        <div class="onb-layer" id="onb-tags"></div>
        <div class="onb-layer" id="onb-devices" style="display:flex;align-items:flex-end;justify-content:center;gap:26px;padding-bottom:6px"></div>
      </div>
      <h2 class="onb-title" id="onb-title"></h2>
      <p class="onb-body" id="onb-body"></p>
      <div class="onb-foot">
        <button class="onb-skip tactile" id="onb-skip">Skip</button>
        <div class="onb-dots" id="onb-dots">${ONB_STEPS.map((_, i) => `<button class="onb-dot" data-step="${i}" aria-label="step ${i + 1}"></button>`).join('')}</div>
        <button class="onb-next tactile" id="onb-next"></button>
      </div>
    </div>`;
  ov.hidden = false;

  let step = 0;
  const cards = [...ov.querySelectorAll('.onb-card')];
  const applyStep = (n) => {
    step = n;
    cards.forEach((el, i) => {
      const d = i - 2;
      if (step === 0) {
        el.style.transform = `translate(${d * 64}px, ${Math.abs(d) * 14 - 22}px) rotate(${d * 9}deg)`;
        el.style.opacity = '1';
      } else {
        el.style.transform = `translateY(${d * 9}px) scale(${1 - Math.abs(d) * 0.06})`;
        el.style.opacity = i === 2 ? '1' : '.5';
      }
    });
    $('#onb-tags', ov).innerHTML = step === 1
      ? ONB_TAGS.map((tg, i) => `<span class="onb-tag" style="color:${tg.c};border-color:color-mix(in srgb, ${tg.c} 45%, transparent);transform:translate(-50%,-50%) translate(${tg.x}px,${tg.y}px) rotate(${tg.r}deg);animation-delay:${150 + i * 90}ms"><span class="d" style="background:${tg.c}"></span>${tg.label}</span>`).join('')
      : '';
    $('#onb-devices', ov).innerHTML = step === 2
      ? Object.keys(DEV_GLYPHS).map((k, i) => `<div class="onb-dev" style="animation-delay:${i * 110}ms"><div class="glyph">${DEV_GLYPHS[k]}</div><span style="color:var(--sub)">${CHECK}</span></div>`).join('')
      : '';
    $('#onb-title', ov).textContent = ONB_STEPS[step].title;
    $('#onb-body', ov).textContent = ONB_STEPS[step].body;
    ov.querySelectorAll('.onb-dot').forEach((dt, i) => dt.classList.toggle('on', i === step));
    $('#onb-next', ov).innerHTML = (step < 2 ? 'Next' : 'Get started') + ' →';
  };

  applyStep(0);
  $('#onb-skip', ov).onclick = finishOnboarding;
  $('#onb-next', ov).onclick = () => { step < 2 ? applyStep(step + 1) : finishOnboarding(); };
  ov.querySelectorAll('.onb-dot').forEach((dt) => dt.onclick = () => applyStep(Number(dt.dataset.step)));
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
