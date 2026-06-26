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

// ── i18n (RU/ENG) ───────────────────────────────────────────────────────────────
// All user-facing copy lives here. t('key', a, b) substitutes {0},{1}. The active
// language is prefs.lang; header toggle flips it. Brand "SESSIONVAULT" stays as-is.
// Engine error messages (from background/) are returned in English and not covered.
const I18N = {
  en: {
    age_days: "{0} days ago", age_yesterday: "yesterday", age_h: "{0}h ago", age_m: "{0}m ago", age_now: "just now",
    unfiled: "Unfiled", undo: "UNDO",
    prev_shelf: "Previous shelf", next_shelf: "Next shelf", new_shelf: "New shelf",
    sessions: "SESSIONS", tabs: "TABS", search: "SEARCH…", save_open: "＋ SAVE OPEN TABS",
    chip_pro_title: "Pro — unlimited saved sessions", chip_free_title: "{0} of {1} free saved sessions",
    cloud_sync: "Cloud sync", settings: "Settings", language: "Language",
    crash_q: "Did your browser close unexpectedly?",
    crash_sub: "{0} of {1} tabs from before aren't open — bring them back.",
    recover_n: "↩ RECOVER {0} TABS", dismiss: "Dismiss",
    stamp: "{0} TABS KEPT ★ {1} SESSIONS",
    drop_delete: "DROP TO DELETE", bin: "BIN",
    empty_h: "this shelf is bare", empty_b: "Save your open tabs into a stack with “Save open tabs”.",
    restore_all: "↗ ALL",
    restored_tabs: "↗ {0} tabs restored — opening windows", copied: "⤴ tab list copied to clipboard",
    confirm_delete: "Delete “{0}” ({1} tabs)?", moved_bin: "“{0}” moved to the bin",
    recovering: "↩ RECOVERING…", recovered: "↩ recovered {0} tabs into a new session",
    nothing_recover: "Nothing to recover — no snapshot from a previous session",
    recover_fail: "Could not recover: {0}", recovery_dismissed: "Recovery dismissed",
    name_session: "Name this session:", session_default: "Session — {0}", open_tabs_fallback: "Open tabs",
    saved_ok: "✓ open tabs saved as a new session",
    free_limit: "Free limit reached (50). Delete some or upgrade to Pro.", save_fail: "Could not save: {0}",
    saved_tabs: "✓ saved {0} tabs{1}",
    save_open_tabs: "SAVE OPEN TABS", cancel: "CANCEL", session_name_ph: "session name", into: "INTO",
    all_btn: "All", none_btn: "None", sel_count: "{0} of {1} selected", save_n: "＋ SAVE {0} TABS", saving: "SAVING…",
    new_shelf_name: "New shelf name:",
    cards_dealt: "{0} cards dealt", restore_all_btn: "↗ RESTORE ALL", share_btn: "⤴ SHARE",
    bin_it: "× BIN IT", restack: "RESTACK ↩", open_this: "Open this tab",
    click_restack: "CLICK ANYWHERE TO RESTACK", tab_opened: "↗ tab opened",
    the_bin: "THE BIN", sessions_deleted: "{0} sessions deleted", empty_good: "EMPTY FOR GOOD",
    back: "BACK ↩", bin_empty: "Bin is empty.", restore_btn: "↩ RESTORE",
    bin_emptied: "Bin emptied", restored_shelf: "restored to the shelf",
    settings_title: "SETTINGS", replay_intro: "↻ REPLAY INTRO", done: "DONE ↩",
    appearance: "APPEARANCE", behaviour: "BEHAVIOUR",
    theme: "Theme", theme_h: "Light desk or midnight desk", theme_light: "light", theme_dark: "dark",
    texture: "Desk texture", texture_h: "The grain under your stacks", tex_grain: "grain", tex_linen: "linen", tex_clean: "clean",
    reduce_motion: "Reduce motion", reduce_h: "Calm the springs and shuffles",
    confirm_bin: "Confirm before binning", confirm_bin_h: "Ask first when you delete a stack",
    autosave: "Autosave open tabs", autosave_h: "Periodically snapshot your tabs (Pro)",
    autosave_int: "Autosave interval", autosave_int_h: "Minutes between snapshots",
    keep_auto: "Keep autosaves", keep_auto_h: "How many snapshots to retain",
    cloud_sync_title: "CLOUD SYNC", create_account: "CREATE ACCOUNT", sign_in: "SIGN IN",
    confirm_almost: "Almost there — confirm your email",
    confirm_body: "We sent a link to <b>{0}</b>. Open it, tap “Confirm email”, then sign in.",
    confirm_hint: "Don't see it? Check Spam and Promotions — it can take a minute to arrive.",
    resend: "↻ Resend email", check_inbox: "Check your inbox",
    reset_body: "We sent a password-reset link to <b>{0}</b>. Open it to set a new password, then sign in here.",
    reset_hint: "No email? Check Spam — and make sure it's the address you signed up with.",
    reset_title: "RESET PASSWORD", back_signin: "← Back to sign in",
    send_reset: "SEND RESET LINK", resend_reset: "RESEND RESET LINK",
    reset_lead: "Enter your account email — we'll send a link to set a new password. Your encryption passphrase is separate and isn't changed here.",
    ph_email: "email", ph_password: "password", ph_confirm_pw: "confirm password",
    pw_warn: "Use only English letters, numbers and symbols — no spaces, accents or non-Latin characters.",
    create_connect: "CREATE ACCOUNT & CONNECT", signin_connect: "SIGN IN & CONNECT",
    have_account: "Have an account?", new_here: "New here?", sign_in_link: "Sign in", create_one: "Create one",
    forgot_pw: "Forgot password?", e2e_note: "End-to-end encrypted. Your passphrase never leaves this device.",
    signed_in: "Signed in", sign_out: "SIGN OUT", enc_passphrase: "ENCRYPTION PASSPHRASE",
    ph_passphrase: "passphrase (same on every device)", pp_default: "used to encrypt your vault before it leaves the device",
    sync_now: "⟳ SYNC NOW", syncing: "⟳ SYNCING…", last_synced: "Last synced {0}", not_synced: "Not synced yet",
    show_pw: "Show password", hide_pw: "Hide password",
    toast_enter_creds: "Enter email and password", toast_pw_short: "Password must be at least 6 characters",
    toast_pw_mismatch: "Passwords don’t match", toast_connected: "☁ connected",
    toast_enter_email: "Enter your email first", sending: "Sending…", reset_fail: "Could not send reset email",
    resend_sent: "✉ confirmation email sent again", resend_fail: "Could not resend right now — try again in a minute",
    enter_passphrase: "Enter your passphrase first", sync_failed: "Sync failed: {0}", vault_synced: "☁ vault synced",
    onb_tagline: "SESSIONVAULT — TAB MANAGER", onb_hero: "A thousand tabs.\nOne vault.",
    onb_hero_sub: "SessionVault collapses your open tabs into tidy sessions — and brings them back in one click.",
    onb1_t: "One click — then silence",
    onb1_b: "SessionVault collapses all your open tabs into tidy sessions — and brings them back in one click. Let your browser breathe.",
    onb2_t: "Order finds itself",
    onb2_b: "Tags, search and folders. Drag sessions around the desk and file them into shelves like cards on a board.",
    onb3_t: "Everywhere you go",
    onb3_b: "Sessions sync, end-to-end encrypted, across your devices. Home, work, on the road — your vault is always at hand.",
    onb_get_started_q: "Get started?", onb_get_started: "Get started →", skip: "Skip", scroll_more: "scroll to discover more",
    onb_click: "CLICK", onb_collected: "collected", tag_work: "work", tag_research: "research",
  },
  ru: {
    age_days: "{0} дн. назад", age_yesterday: "вчера", age_h: "{0} ч назад", age_m: "{0} мин назад", age_now: "только что",
    unfiled: "Без полки", undo: "ОТМЕНА",
    prev_shelf: "Предыдущая полка", next_shelf: "Следующая полка", new_shelf: "Новая полка",
    sessions: "СЕССИЙ", tabs: "ВКЛАДОК", search: "ПОИСК…", save_open: "＋ СОХРАНИТЬ ВКЛАДКИ",
    chip_pro_title: "Pro — без лимита сессий", chip_free_title: "{0} из {1} бесплатных сессий",
    cloud_sync: "Облачная синхронизация", settings: "Настройки", language: "Язык",
    crash_q: "Браузер закрылся неожиданно?",
    crash_sub: "{0} из {1} прежних вкладок не открыты — вернуть их.",
    recover_n: "↩ ВЕРНУТЬ {0} ВКЛ.", dismiss: "Скрыть",
    stamp: "{0} ВКЛАДОК СОХРАНЕНО ★ {1} СЕССИЙ",
    drop_delete: "БРОСЬ, ЧТОБЫ УДАЛИТЬ", bin: "КОРЗИНА",
    empty_h: "полка пуста", empty_b: "Сохрани открытые вкладки кнопкой «Сохранить вкладки».",
    restore_all: "↗ ВСЕ",
    restored_tabs: "↗ {0} вкладок восстановлено — открываю окна", copied: "⤴ список вкладок скопирован",
    confirm_delete: "Удалить «{0}» ({1} вкл.)?", moved_bin: "«{0}» в корзине",
    recovering: "↩ ВОССТАНАВЛИВАЮ…", recovered: "↩ восстановлено {0} вкладок в новую сессию",
    nothing_recover: "Нечего восстанавливать — нет снимка прошлой сессии",
    recover_fail: "Не удалось восстановить: {0}", recovery_dismissed: "Восстановление скрыто",
    name_session: "Назовите сессию:", session_default: "Сессия — {0}", open_tabs_fallback: "Открытые вкладки",
    saved_ok: "✓ вкладки сохранены в новую сессию",
    free_limit: "Достигнут лимит (50). Удалите часть или перейдите на Pro.", save_fail: "Не удалось сохранить: {0}",
    saved_tabs: "✓ сохранено вкладок: {0}{1}",
    save_open_tabs: "СОХРАНИТЬ ВКЛАДКИ", cancel: "ОТМЕНА", session_name_ph: "название сессии", into: "В ПОЛКУ",
    all_btn: "Все", none_btn: "Нет", sel_count: "{0} из {1} выбрано", save_n: "＋ СОХРАНИТЬ {0}", saving: "СОХРАНЯЮ…",
    new_shelf_name: "Название новой полки:",
    cards_dealt: "{0} карт разложено", restore_all_btn: "↗ ВЕРНУТЬ ВСЕ", share_btn: "⤴ ПОДЕЛИТЬСЯ",
    bin_it: "× В КОРЗИНУ", restack: "СЛОЖИТЬ ↩", open_this: "Открыть вкладку",
    click_restack: "КЛИКНИ ГДЕ УГОДНО, ЧТОБЫ СЛОЖИТЬ", tab_opened: "↗ вкладка открыта",
    the_bin: "КОРЗИНА", sessions_deleted: "{0} удалённых сессий", empty_good: "ОЧИСТИТЬ НАВСЕГДА",
    back: "НАЗАД ↩", bin_empty: "Корзина пуста.", restore_btn: "↩ ВЕРНУТЬ",
    bin_emptied: "Корзина очищена", restored_shelf: "возвращено на полку",
    settings_title: "НАСТРОЙКИ", replay_intro: "↻ ПОВТОР ИНТРО", done: "ГОТОВО ↩",
    appearance: "ВНЕШНИЙ ВИД", behaviour: "ПОВЕДЕНИЕ",
    theme: "Тема", theme_h: "Светлый стол или ночной", theme_light: "светлый", theme_dark: "тёмный",
    texture: "Текстура стола", texture_h: "Фактура под стопками", tex_grain: "зерно", tex_linen: "лён", tex_clean: "чисто",
    reduce_motion: "Меньше движения", reduce_h: "Успокоить пружины и тасовку",
    confirm_bin: "Подтверждать удаление", confirm_bin_h: "Спрашивать перед удалением стопки",
    autosave: "Автосохранение вкладок", autosave_h: "Периодические снимки вкладок (Pro)",
    autosave_int: "Интервал автосохранения", autosave_int_h: "Минут между снимками",
    keep_auto: "Хранить автосохранения", keep_auto_h: "Сколько снимков хранить",
    cloud_sync_title: "ОБЛАЧНЫЙ СИНК", create_account: "СОЗДАТЬ АККАУНТ", sign_in: "ВХОД",
    confirm_almost: "Почти готово — подтвердите почту",
    confirm_body: "Мы отправили ссылку на <b>{0}</b>. Откройте её, нажмите «Confirm email», затем войдите.",
    confirm_hint: "Нет письма? Проверьте Спам и Промоакции — может прийти через минуту.",
    resend: "↻ Отправить снова", check_inbox: "Проверьте почту",
    reset_body: "Мы отправили ссылку для сброса на <b>{0}</b>. Откройте её, задайте новый пароль и войдите здесь.",
    reset_hint: "Нет письма? Проверьте Спам — и что это та почта, на которую регистрировались.",
    reset_title: "СБРОС ПАРОЛЯ", back_signin: "← Назад ко входу",
    send_reset: "ОТПРАВИТЬ ССЫЛКУ", resend_reset: "ОТПРАВИТЬ СНОВА",
    reset_lead: "Введите почту аккаунта — пришлём ссылку для нового пароля. Парольная фраза шифрования отдельная и здесь не меняется.",
    ph_email: "почта", ph_password: "пароль", ph_confirm_pw: "повторите пароль",
    pw_warn: "Только латинские буквы, цифры и символы — без пробелов, акцентов и не-латинских символов.",
    create_connect: "СОЗДАТЬ И ПОДКЛЮЧИТЬ", signin_connect: "ВОЙТИ И ПОДКЛЮЧИТЬ",
    have_account: "Уже есть аккаунт?", new_here: "Впервые здесь?", sign_in_link: "Войти", create_one: "Создать",
    forgot_pw: "Забыли пароль?", e2e_note: "Сквозное шифрование. Парольная фраза не покидает это устройство.",
    signed_in: "Выполнен вход", sign_out: "ВЫЙТИ", enc_passphrase: "ПАРОЛЬНАЯ ФРАЗА",
    ph_passphrase: "парольная фраза (одна на всех устройствах)", pp_default: "ею шифруется хранилище перед отправкой с устройства",
    sync_now: "⟳ СИНХРОНИЗИРОВАТЬ", syncing: "⟳ СИНХРОНИЗАЦИЯ…", last_synced: "Синхронизировано {0}", not_synced: "Ещё не синхронизировано",
    show_pw: "Показать пароль", hide_pw: "Скрыть пароль",
    toast_enter_creds: "Введите почту и пароль", toast_pw_short: "Пароль минимум 6 символов",
    toast_pw_mismatch: "Пароли не совпадают", toast_connected: "☁ подключено",
    toast_enter_email: "Сначала введите почту", sending: "Отправляю…", reset_fail: "Не удалось отправить письмо сброса",
    resend_sent: "✉ письмо отправлено повторно", resend_fail: "Не удалось отправить — попробуйте через минуту",
    enter_passphrase: "Сначала введите парольную фразу", sync_failed: "Сбой синхронизации: {0}", vault_synced: "☁ хранилище синхронизировано",
    onb_tagline: "SESSIONVAULT — МЕНЕДЖЕР ВКЛАДОК", onb_hero: "Тысяча вкладок.\nОдно хранилище.",
    onb_hero_sub: "SessionVault сворачивает открытые вкладки в аккуратные сессии — и возвращает их одним кликом.",
    onb1_t: "Один клик — и тишина",
    onb1_b: "SessionVault сворачивает все открытые вкладки в аккуратные сессии — и возвращает одним кликом. Дай браузеру вздохнуть.",
    onb2_t: "Порядок наводится сам",
    onb2_b: "Теги, поиск и папки. Перетаскивай сессии по столу и раскладывай по полкам, как карточки на доске.",
    onb3_t: "Везде, где ты есть",
    onb3_b: "Сессии синхронизируются со сквозным шифрованием между устройствами. Дом, работа, дорога — хранилище всегда под рукой.",
    onb_get_started_q: "Начнём?", onb_get_started: "Начать →", skip: "Пропустить", scroll_more: "листай, чтобы узнать больше",
    onb_click: "КЛИК", onb_collected: "собрано", tag_work: "работа", tag_research: "учёба",
  },
};
function t(key, ...args) {
  const dict = I18N[prefs && prefs.lang === 'ru' ? 'ru' : 'en'];
  let s = (dict && dict[key]) ?? I18N.en[key] ?? key;
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '') : s;
}

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
  if (day > 1) return t('age_days', day);
  if (day === 1) return t('age_yesterday');
  if (h >= 1) return t('age_h', h);
  if (m >= 1) return t('age_m', m);
  return t('age_now');
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
const DEFAULT_PREFS = { theme: 'light', texture: 'grain', reduceMotion: false, confirmTrash: false, autoRestack: true, lang: 'en' };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }
function applyPrefs() {
  app.dataset.theme = prefs.theme;
  app.dataset.texture = prefs.texture;
  app.dataset.reduce = prefs.reduceMotion ? '1' : '0';
  app.dataset.lang = prefs.lang;
  try { document.documentElement.lang = prefs.lang; } catch {}
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
  const list = [{ id: UNFILED, name: t('unfiled'), color: 'var(--sub)' }];
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
  el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? `<button id="toast-undo">${t('undo')}</button>` : '');
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
      <button class="rail-arrow tactile" id="flip-prev" title="${t('prev_shelf')}">‹</button>
      <div class="rail-tabs" id="rail-tabs">
        ${shs.map((sh) => `
          <button class="tab${sh.id === active.id ? ' on' : ''}" data-shelf="${esc(sh.id)}">
            <span class="dot" style="background:${esc(sh.color)}"></span>${esc(sh.name)}
            <span class="count mono">${sh.sessions.length}</span>
          </button>`).join('')}
        <button class="tab-add" id="add-folder" title="${t('new_shelf')}">+</button>
      </div>
      <button class="rail-arrow tactile" id="flip-next" title="${t('next_shelf')}">›</button>
    </div>

    <div class="desk">
      <div class="head">
        <div>
          <h1 class="black">SESSIONVAULT</h1>
          <div class="meta mono"><b style="color:${esc(active.color)}">${esc(active.name.toUpperCase())}</b> · ${sessions.length} ${t('sessions')} · ${totalTabs} ${t('tabs')}</div>
        </div>
        <div class="head-actions">
          <div class="searchbox"><span>⌕</span><input id="search" class="mono" placeholder="${t('search')}" value="${esc(query)}" /></div>
          <button class="btn-squash tactile" id="squash">${t('save_open')}</button>
          <div class="limit-chip mono" data-level="${limitLevel()}" id="limit-chip"
               title="${isPro() ? t('chip_pro_title') : t('chip_free_title', savedCount(), freeLimit())}">
            ${isPro() ? '∞ PRO' : `${savedCount()}<span class="sep">/</span>${freeLimit()}`}
          </div>
          <button class="btn-gear btn-lang tactile mono" id="lang" title="${t('language')}">${prefs.lang === 'ru' ? 'RU' : 'EN'}</button>
          <button class="btn-gear tactile" id="cloud" title="${t('cloud_sync')}">☁</button>
          <button class="btn-gear tactile" id="gear" title="${t('settings')}">⚙</button>
        </div>
      </div>

      ${recovery().available ? `
      <div class="recover-banner" id="recover-banner">
        <span class="rb-ico">↩</span>
        <div class="rb-text">
          <b>${t('crash_q')}</b>
          <span class="rb-sub mono">${t('crash_sub', recovery().missingCount, recovery().tabCount)}</span>
        </div>
        <span style="flex:1"></span>
        <button class="rb-do tactile" id="recover-do">${t('recover_n', recovery().missingCount)}</button>
        <button class="rb-x tactile" id="recover-x" title="${t('dismiss')}">×</button>
      </div>` : ''}

      <div class="stats-stamp mono">${st ? t('stamp', st.totalTabs, st.sessions.total) : 'SESSIONVAULT'}</div>

      <div class="trash-corner mono" id="trash-corner">
        <span class="big">⌫</span><span>${t('drop_delete')}</span>
        <span style="opacity:.6">(${t('bin')})</span>
      </div>

      <div class="stacks slidein" id="stacks" key="${esc(active.id)}">
        ${sessions.map((s, i) => stackHTML(s, i)).join('')}
      </div>

      ${sessions.length === 0 ? `
        <div class="empty">
          <div class="h hand">${t('empty_h')}</div>
          <div class="b hand">${t('empty_b')}</div>
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
          <div class="sub mono">${s.tabs.length} ${t('tabs')} · ${esc(ageOf(s.createdAt).toUpperCase())}</div>
        </div>
        <div class="acts">
          <button class="actbtn" data-act="restore" data-id="${esc(s.id)}">${t('restore_all')}</button>
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
  $('#lang').onclick = () => {
    prefs.lang = prefs.lang === 'ru' ? 'en' : 'ru'; savePrefs(); applyPrefs();
    render();
    if ($('#overlay-onb')) renderOnboarding(); // onboarding isn't re-rendered by render()
  };
  $('#trash-corner').onclick = () => { trashOpen = true; renderTrashOverlay(); };

  // crash-recovery banner
  const rdo = $('#recover-do'), rx = $('#recover-x');
  if (rdo) rdo.onclick = onRecover;
  if (rx) rx.onclick = async () => { await api.dismissRecovery(); state.recovery = { available: false }; render(); toast(t('recovery_dismissed')); };

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
    toast(t('restored_tabs', s.tabs.length));
    return;
  }
  if (act === 'share') {
    const text = await api.exportSessionText(id);
    try { await navigator.clipboard.writeText(text); } catch {}
    toast(t('copied'));
    return;
  }
  if (act === 'trash') {
    if (prefs.confirmTrash && !viaDrop && !confirm(t('confirm_delete', s.name, s.tabs.length))) return;
    await api.deleteSession(id);
    spreadId = null;
    await refresh();
    toast(t('moved_bin', s.name), async () => { await api.restoreFromTrash(id); await refresh(); });
  }
}

async function onRecover() {
  const btn = $('#recover-do'); if (btn) { btn.disabled = true; btn.textContent = t('recovering'); }
  try {
    const s = await api.recoverLast(); // clears the candidate in the engine
    if (s) {
      activeShelf = UNFILED;
      await refresh(); // re-peeks recovery → banner goes away
      toast(t('recovered', s.tabs.length));
    } else {
      await refresh();
      toast(t('nothing_recover'));
    }
  } catch (err) {
    render();
    toast(t('recover_fail', err.message));
  }
}

function defaultSessionName() {
  return t('session_default', new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
}

async function onSquash() {
  let tabs = [];
  // Newer engine lets us list the open tabs so the user can pick a subset.
  try { tabs = await api.getOpenTabs(); } catch { tabs = []; }
  if (tabs && tabs.length) return openSavePicker(tabs);
  return legacySaveAll(); // older engine (no GET_OPEN_TABS) → save everything, as before
}

// Fallback: save all open tabs (the original prompt-based flow).
async function legacySaveAll() {
  const name = prompt(t('name_session'), defaultSessionName());
  if (name === null) return;
  await saveTabs(name || t('open_tabs_fallback'), activeShelf === UNFILED ? null : activeShelf, undefined, null);
}

// Shared save → move-to-folder → refresh + toast. `ids` undefined = save all.
async function saveTabs(name, folderId, ids, onErr) {
  try {
    const s = await api.saveSession(name, folderId, ids);
    if (s && folderId && s.folderId !== folderId) await api.moveSessionToFolder(s.id, folderId);
    if (folderId) activeShelf = folderId;
    await refresh();
    const n = ids ? ids.length : (s?.tabs?.length ?? 0);
    const where = folderId ? ' → ' + (state.folders[folderId]?.name || '').toUpperCase() : '';
    toast(t('saved_tabs', n, where));
    return true;
  } catch (err) {
    if (String(err.message).startsWith('FREE_LIMIT_REACHED')) toast(t('free_limit'));
    else toast(t('save_fail', err.message));
    if (onErr) onErr();
    return false;
  }
}

// Picker: choose which open tabs to save (and into which shelf).
function openSavePicker(tabs) {
  const selected = new Set(tabs.map((t) => t.id));
  const defFolder = activeShelf === UNFILED ? '' : activeShelf;
  let ov = $('#overlay-save');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-save'; ov.className = 'modal-center'; app.appendChild(ov); }

  const folderOpts = [`<option value="">${esc(t('unfiled'))}</option>`]
    .concat(Object.values(state.folders).map((f) =>
      `<option value="${esc(f.id)}"${f.id === defFolder ? ' selected' : ''}>${esc(f.name)}</option>`)).join('');

  const rowHTML = (t) => {
    const dom = domainOf(t.url), initial = (dom[0] || '?').toUpperCase();
    return `<label class="sp-row" data-id="${esc(t.id)}">
        <input type="checkbox" class="sp-cb" ${selected.has(t.id) ? 'checked' : ''} />
        <span class="sp-fav" style="background:${colorFor(dom)}">${esc(initial)}</span>
        <span class="sp-info"><span class="sp-title">${esc(t.title || dom)}</span><span class="sp-dom mono">${esc(dom)}</span></span>
        ${t.pinned ? '<span class="sp-pin mono">PIN</span>' : ''}
      </label>`;
  };

  ov.innerHTML = `<div class="modal" style="width:480px">
      <div class="modal-head"><span class="black" style="font-size:26px">${esc(t('save_open_tabs'))}</span><span style="flex:1"></span><button class="actbtn" data-cancel>${esc(t('cancel'))}</button></div>
      <input id="sp-name" class="sync-input mono" type="text" value="${esc(defaultSessionName())}" placeholder="${esc(t('session_name_ph'))}" />
      <div class="sp-folder mono"><span class="sp-into">${esc(t('into'))}</span><select id="sp-folder" class="sp-select mono">${folderOpts}</select></div>
      <div class="sp-bar mono"><span id="sp-count"></span><span style="flex:1"></span><button class="sync-link" id="sp-all">${esc(t('all_btn'))}</button><button class="sync-link" id="sp-none">${esc(t('none_btn'))}</button></div>
      <div class="sp-list">${tabs.map(rowHTML).join('')}</div>
      <button class="btn-squash tactile" id="sp-save" style="width:100%;margin-top:14px;transform:none"></button>
    </div>`;
  ov.hidden = false;

  const update = () => {
    $('#sp-count', ov).textContent = t('sel_count', selected.size, tabs.length);
    const btn = $('#sp-save', ov);
    btn.textContent = t('save_n', selected.size);
    btn.disabled = selected.size === 0;
  };
  update();

  ov.onpointerdown = (e) => { ov._downSelf = (e.target === ov); };
  ov.onclick = (e) => { if (ov._downSelf && e.target === ov) closeSave(); };
  $('[data-cancel]', ov).onclick = closeSave;
  ov.querySelectorAll('.sp-row').forEach((row) => {
    const cb = $('.sp-cb', row), id = row.dataset.id;
    cb.onchange = () => { cb.checked ? selected.add(id) : selected.delete(id); update(); };
  });
  $('#sp-all', ov).onclick = () => { tabs.forEach((t) => selected.add(t.id)); ov.querySelectorAll('.sp-cb').forEach((c) => c.checked = true); update(); };
  $('#sp-none', ov).onclick = () => { selected.clear(); ov.querySelectorAll('.sp-cb').forEach((c) => c.checked = false); update(); };
  $('#sp-save', ov).onclick = async () => {
    if (!selected.size) return;
    const name = $('#sp-name', ov).value.trim() || t('open_tabs_fallback');
    const folderId = $('#sp-folder', ov).value || null;
    const ids = tabs.filter((t) => selected.has(t.id)).map((t) => t.id);
    const btn = $('#sp-save', ov); btn.disabled = true; btn.textContent = t('saving');
    // all selected → omit ids so the engine saves everything (back-compat)
    const ok = await saveTabs(name, folderId, ids.length === tabs.length ? undefined : ids, () => { btn.disabled = false; update(); });
    if (ok) closeSave();
  };
}
function closeSave() { const ov = $('#overlay-save'); if (ov) ov.remove(); }

async function onAddFolder() {
  const name = prompt(t('new_shelf_name'));
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
      <span class="overlay-sub mono">${t('cards_dealt', s.tabs.length)}</span>
      <span style="flex:1"></span>
      <button class="actbtn" data-sp="restore">${t('restore_all_btn')}</button>
      <button class="actbtn" data-sp="share">${t('share_btn')}</button>
      <button class="actbtn" data-sp="trash">${t('bin_it')}</button>
      <button class="actbtn" data-sp="close">${t('restack')}</button>
    </div>
    <div class="cards" data-stop>
      ${s.tabs.map((tb, i) => `
        <div class="card" style="animation-delay:${i * 0.04}s; transform:rotate(${(i % 3) - 1}deg)">
          <div class="strip" style="background:${esc(colorFor(domainOf(tb.url)))}"></div>
          <div class="ctitle">${esc(tb.title || domainOf(tb.url))}</div>
          <div class="crow">
            <span class="cdom mono">${esc(domainOf(tb.url))}</span>
            <span class="cdacts"><button class="ico" data-open="${esc(tb.url)}" title="${t('open_this')}">↗</button></span>
          </div>
        </div>`).join('')}
    </div>
    <div class="mono" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);font-size:10px;letter-spacing:.2em;color:var(--sub)">${t('click_restack')}</div>
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
    e.stopPropagation(); await api.restoreTab(b.dataset.open); toast(t('tab_opened'));
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
      <span class="overlay-title black">${t('the_bin')}</span>
      <span class="overlay-sub mono">${t('sessions_deleted', entries.length)}</span>
      <span style="flex:1"></span>
      ${entries.length ? `<button class="actbtn" data-tr="empty">${t('empty_good')}</button>` : ''}
      <button class="actbtn" data-tr="close">${t('back')}</button>
    </div>
    <div class="cards" data-stop>
      ${entries.length === 0 ? `<div class="hand" style="font-size:34px;opacity:.5">${t('bin_empty')}</div>` : ''}
      ${entries.map((s, i) => `
        <div class="trash-card" style="animation-delay:${i * 0.04}s; transform:rotate(${(i % 3) - 1}deg)">
          <div class="tname black">${esc(s.name)}</div>
          <div class="mono" style="font-size:9px;letter-spacing:.12em;color:var(--sub);flex:1">${s.tabs.length} ${t('tabs')}</div>
          <button class="actbtn" style="align-self:flex-start" data-putback="${esc(s.id)}">${t('restore_btn')}</button>
        </div>`).join('')}
    </div>`;
  ov.hidden = false;
  ov.onpointerdown = (e) => { ov._downSelf = (e.target === ov); };
  ov.onclick = (e) => { if (ov._downSelf && !e.target.closest('[data-stop]')) closeTrash(); };
  ov.querySelectorAll('[data-tr]').forEach((b) => b.onclick = async () => {
    if (b.dataset.tr === 'close') return closeTrash();
    if (b.dataset.tr === 'empty') { await api.emptyTrash(); renderTrashOverlay(); toast(t('bin_emptied')); }
  });
  ov.querySelectorAll('[data-putback]').forEach((b) => b.onclick = async () => {
    await api.restoreFromTrash(b.dataset.putback); await loadData(); renderTrashOverlay(); render(); renderTrashOverlay();
    toast(t('restored_shelf'));
  });
}
function closeTrash() { trashOpen = false; const ov = $('#overlay-trash'); if (ov) ov.remove(); }

// ── settings overlay ─────────────────────────────────────────────────────────────
function renderSettings() {
  const s = state.settings;
  let ov = $('#overlay-settings');
  if (!ov) { ov = document.createElement('div'); ov.id = 'overlay-settings'; ov.className = 'modal-center'; app.appendChild(ov); }
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, label]) => `<button class="${prefs[key] === v ? 'on' : ''}" data-seg="${key}" data-val="${v}">${label}</button>`).join('')}</div>`;
  const toggle = (key, on) => `<button class="toggle ${on ? 'on' : ''}" data-toggle="${key}"><i></i></button>`;
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <span class="black" style="font-size:34px">${t('settings_title')}</span>
        <span style="flex:1"></span>
        <button class="actbtn" data-replay>${t('replay_intro')}</button>
        <button class="actbtn" data-done>${t('done')}</button>
      </div>

      <div class="set-section mono">${t('appearance')}</div>
      <div class="set-row"><div class="label"><div class="l">${t('theme')}</div><div class="h mono">${t('theme_h')}</div></div>${seg('theme', [['light', t('theme_light')], ['dark', t('theme_dark')]])}</div>
      <div class="set-row"><div class="label"><div class="l">${t('texture')}</div><div class="h mono">${t('texture_h')}</div></div>${seg('texture', [['grain', t('tex_grain')], ['linen', t('tex_linen')], ['clean', t('tex_clean')]])}</div>
      <div class="set-row"><div class="label"><div class="l">${t('reduce_motion')}</div><div class="h mono">${t('reduce_h')}</div></div>${toggle('reduceMotion', prefs.reduceMotion)}</div>

      <div class="set-section mono">${t('behaviour')}</div>
      <div class="set-row"><div class="label"><div class="l">${t('confirm_bin')}</div><div class="h mono">${t('confirm_bin_h')}</div></div>${toggle('confirmTrash', prefs.confirmTrash)}</div>
      <div class="set-row"><div class="label"><div class="l">${t('autosave')}</div><div class="h mono">${t('autosave_h')}</div></div>${toggle('autosaveEnabled', !!s.autosaveEnabled)}</div>
      <div class="set-row"><div class="label"><div class="l">${t('autosave_int')}</div><div class="h mono">${t('autosave_int_h')}</div></div><input class="num mono" id="set-interval" type="number" min="1" max="1440" value="${esc(s.autosaveInterval ?? 10)}" /></div>
      <div class="set-row"><div class="label"><div class="l">${t('keep_auto')}</div><div class="h mono">${t('keep_auto_h')}</div></div><input class="num mono" id="set-maxauto" type="number" min="1" max="100" value="${esc(s.maxAutoSessions ?? 5)}" /></div>
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
  if (!status.enabled && syncMode === 'forgot') {
    // Dedicated password-recovery screen — its own view, not inline in sign-in.
    const resetBlock = resetSentEmail ? `
      <div class="sync-info">
        <span class="si-ico">🔑</span>
        <div class="si-text">
          <b>${t('check_inbox')}</b>
          <span class="si-body">${t('reset_body', esc(resetSentEmail))}</span>
          <span class="si-hint mono">${t('reset_hint')}</span>
        </div>
      </div>` : '';
    body = `
      <div class="set-section mono">${t('reset_title')}</div>
      <p class="sync-lead mono">${t('reset_lead')}</p>
      ${resetBlock}
      <input id="sync-email" class="sync-input mono" type="email" placeholder="${t('ph_email')}" autocomplete="username" value="${esc(syncEmail)}" />
      ${errLine}
      <button class="btn-squash tactile" id="sync-reset-send" style="width:100%;margin-top:12px;transform:none">
        ${resetSentEmail ? t('resend_reset') : t('send_reset')}
      </button>
      <div class="sync-foot mono">
        <button class="sync-link" id="sync-back">${t('back_signin')}</button>
      </div>`;
  } else if (!status.enabled) {
    // After a successful Create account, Supabase sends a confirmation link and
    // returns no session yet — that's a SUCCESS, not an error. Show a friendly
    // (non-red) block, with the account's email prefilled for the next sign-in.
    const confirmBlock = confirmEmail ? `
      <div class="sync-info">
        <span class="si-ico">✉</span>
        <div class="si-text">
          <b>${t('confirm_almost')}</b>
          <span class="si-body">${t('confirm_body', esc(confirmEmail))}</span>
          <span class="si-hint mono">${t('confirm_hint')}</span>
          <button class="si-resend mono" id="sync-resend">${t('resend')}</button>
        </div>
      </div>` : '';
    const isSignup = syncMode === 'signup';
    // Sign-up only: confirm the password to catch typos before the account exists.
    // Always in the DOM (so it can animate); revealed once the password is typed.
    const confirmPwInput = isSignup ? `
      <div class="pw2-wrap" id="pw2-wrap">
        <div class="pw2-inner">
          <input id="sync-pw2" class="sync-input mono" type="password" placeholder="${t('ph_confirm_pw')}" autocomplete="new-password" />
        </div>
      </div>` : '';
    // Sign-in only: a way out when the account password is forgotten → its own screen.
    const forgotLink = !isSignup ? `
      <div class="sync-foot mono" style="margin-top:8px">
        <button class="sync-link" id="sync-forgot">${t('forgot_pw')}</button>
      </div>` : '';
    body = `
      <div class="set-section mono">${isSignup ? t('create_account') : t('sign_in')}</div>
      ${confirmBlock}
      <input id="sync-email" class="sync-input mono" type="email" placeholder="${t('ph_email')}" autocomplete="username" value="${esc(syncEmail)}" />
      <div class="sync-pw-wrap">
        <input id="sync-pw" class="sync-input mono has-reveal" type="password" placeholder="${t('ph_password')}" autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
        <button type="button" class="pw-reveal" id="sync-pw-reveal" aria-label="${t('show_pw')}" title="${t('show_pw')}">${EYE_SHOW}</button>
      </div>
      <div class="sync-warn mono" id="sync-pw-warn" hidden>${t('pw_warn')}</div>
      ${confirmPwInput}
      ${forgotLink}
      ${errLine}
      <button class="btn-squash tactile" id="sync-connect" style="width:100%;margin-top:12px;transform:none">
        ${isSignup ? t('create_connect') : t('signin_connect')}
      </button>
      <div class="sync-foot mono">
        ${isSignup ? t('have_account') : t('new_here')}
        <button class="sync-link" id="sync-toggle">${isSignup ? t('sign_in_link') : t('create_one')}</button>
      </div>
      <div class="sync-foot mono" style="opacity:.6">${t('e2e_note')}</div>`;
  } else {
    const a = await api.assessPassphrase(syncPass);
    const segs = Array.from({ length: 4 }).map((_, i) =>
      `<span style="background:${i < a.score ? STRENGTH_COLORS[a.score] : 'var(--paperEdge)'}"></span>`).join('');
    body = `
      <div class="set-row"><div class="label"><div class="l">${t('signed_in')}</div><div class="h mono">${esc(status.email || '')}</div></div>
        <button class="actbtn" id="sync-out">${t('sign_out')}</button></div>
      <div class="set-section mono">${t('enc_passphrase')}</div>
      <input id="sync-pass" class="sync-input mono" type="password" placeholder="${t('ph_passphrase')}" value="${esc(syncPass)}" autocomplete="off" />
      <div class="pp-bar" id="pp-bar">${segs}</div>
      <div class="pp-label mono" id="pp-label">${syncPass ? esc(a.label) + (a.warnings[0] ? ' — ' + esc(a.warnings[0]) : '') : t('pp_default')}</div>
      ${errLine}
      <button class="btn-squash tactile" id="sync-now" style="width:100%;margin-top:14px;transform:none">${t('sync_now')}</button>
      <div class="sync-foot mono">${status.lastSync ? t('last_synced', esc(ageOf(status.lastSync))) : t('not_synced')} · ${esc(status.state)}</div>`;
  }

  ov.innerHTML = `<div class="modal" style="width:420px">
      <div class="modal-head"><span class="black" style="font-size:30px">${t('cloud_sync_title')}</span><span style="flex:1"></span><button class="actbtn" data-done>${t('done')}</button></div>
      ${body}
    </div>`;
  ov.hidden = false;
  ov.onpointerdown = (e) => { ov._downSelf = (e.target === ov); };
  ov.onclick = (e) => { if (ov._downSelf && e.target === ov) closeSync(); };
  $('[data-done]', ov).onclick = closeSync;

  if (!status.enabled && syncMode === 'forgot') {
    // ── Dedicated reset-password screen ──
    $('#sync-email', ov).oninput = (e) => { syncEmail = e.target.value; };
    $('#sync-back', ov).onclick = () => { syncMode = 'signin'; resetSentEmail = null; renderSync(); };
    const send = $('#sync-reset-send', ov);
    send.onclick = async () => {
      const email = $('#sync-email', ov).value.trim();
      if (!email) return toast(t('toast_enter_email'));
      syncEmail = email;
      send.disabled = true; send.textContent = t('sending');
      try {
        await api.recoverPassword(email);
        confirmEmail = null; resetSentEmail = email;
        renderSync();
      } catch (err) {
        toast(String(err.message).replace(/^AUTH_FAILED:\s*/, '') || t('reset_fail'));
        send.disabled = false; send.textContent = resetSentEmail ? t('resend_reset') : t('send_reset');
      }
    };
  } else if (!status.enabled) {
    $('#sync-email', ov).oninput = (e) => { syncEmail = e.target.value; };
    $('#sync-toggle', ov).onclick = () => { syncMode = syncMode === 'signup' ? 'signin' : 'signup'; confirmEmail = null; resetSentEmail = null; renderSync(); };
    // "Forgot password?" → open the dedicated reset screen (carries the typed email).
    const forgot = $('#sync-forgot', ov);
    if (forgot) forgot.onclick = () => { syncMode = 'forgot'; confirmEmail = null; renderSync(); };

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
      reveal.title = reveal.ariaLabel = show ? t('hide_pw') : t('show_pw');
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
      resend.disabled = true; resend.textContent = t('sending');
      try { await api.resendConfirmation(confirmEmail); toast(t('resend_sent')); }
      catch { toast(t('resend_fail')); }
      finally { resend.disabled = false; resend.textContent = t('resend'); }
    };
    $('#sync-connect', ov).onclick = async () => {
      const email = $('#sync-email', ov).value.trim();
      const password = $('#sync-pw', ov).value;
      if (!email || !password) return toast(t('toast_enter_creds'));
      if (hasBadChar(password)) { pwWarn.hidden = false; pw.focus(); return; }
      if (syncMode === 'signup') {
        // Confirm-password guard: catch typos before the account is created.
        if (password.length < 6) return toast(t('toast_pw_short'));
        if (password !== $('#sync-pw2', ov).value) return toast(t('toast_pw_mismatch'));
      }
      syncEmail = email;
      try {
        await api.setSyncEnabled(true, { email, password, signUp: syncMode === 'signup' });
        confirmEmail = null; resetSentEmail = null;
        toast(t('toast_connected'));
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
      $('#pp-label', ov).textContent = syncPass ? a.label + (a.warnings[0] ? ' — ' + a.warnings[0] : '') : t('pp_default');
    };
    $('#sync-out', ov).onclick = async () => { await api.setSyncEnabled(false); syncPass = ''; renderSync(); };
    $('#sync-now', ov).onclick = async () => {
      if (!syncPass) return toast(t('enter_passphrase'));
      $('#sync-now', ov).textContent = t('syncing');
      const st = await api.syncNow(syncPass);
      await loadData(); render(); renderSync();
      toast(st && st.error ? t('sync_failed', st.error) : t('vault_synced'));
    };
  }
}
function renderSyncError(msg) { const ov = $('#overlay-sync'); if (!ov) return; const m = ov.querySelector('.modal'); const e = document.createElement('div'); e.className = 'sync-err mono'; e.textContent = msg; m.appendChild(e); }
function closeSync() { syncOpen = false; syncMode = 'signin'; resetSentEmail = null; const ov = $('#overlay-sync'); if (ov) ov.remove(); }

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
      <div class="onb-clickzone"><span class="halo"></span><span class="zlabel mono">${t('onb_click')}</span></div>
      <span class="onb-cursor">${CURSOR_SVG}</span>
      <div class="onb-collected mono"><span class="onb-check">${CHECK}</span>${t('onb_collected')}</div>
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
  const tags = [{ c: A, x: 27, k: t('tag_work') }, { c: B, x: 73, k: t('tag_research') }].map((g, i) =>
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
            <div class="onb-micro mono onb-r" style="--d:0ms">${t('onb_tagline')}</div>
            <h1 class="onb-h1">${onbWords(t('onb_hero'), 120, 75)}</h1>
            <p class="onb-sub onb-r" style="--d:520ms; margin-inline:auto">${t('onb_hero_sub')}</p>
            <div class="onb-r" style="--d:680ms; margin-top:18px">${onbArt('fan')}</div>
          </div>
        </div>
        ${step('01', t('onb1_t'), t('onb1_b'), onbArtCollect())}
        ${step('02', t('onb2_t'), t('onb2_b'), onbArtSort())}
        ${step('03', t('onb3_t'), t('onb3_b'), onbArtSync())}
        <div class="onb-sec onb-sec-cta">
          <div class="onb-cta-inner">
            <div class="onb-wordmark mono onb-r" style="--d:40ms">SESSIONVAULT</div>
            <h2 class="onb-h1">${onbWords(t('onb_get_started_q'), 140, 80)}</h2>
            <button class="onb-next onb-r" id="onb-start" style="--d:480ms">${t('onb_get_started')}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="onb-logo mono">SESSIONVAULT</div>
    <button class="onb-skip" id="onb-skip">${t('skip')}</button>
    <div class="onb-rail mono"><span id="onb-rail-cur">01</span><span class="bar"><i id="onb-rail-fill"></i></span><span>0${ONB_SECTIONS}</span></div>
    <div class="onb-hint mono" id="onb-hint"><span class="line"></span> ${t('scroll_more')}</div>
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
    if ($('#overlay-save')) return closeSave();
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
