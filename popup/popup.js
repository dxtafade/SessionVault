/**
 * UI script — owned by the UI developer.
 *
 * All backend access goes through ./api.js (the adapter layer). This file is
 * pure presentation: rendering, search, modals, view switching, settings.
 */

import * as api from './api.js';

// ─── Small DOM helpers ─────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);

/** Escape text for safe insertion into HTML (prevents XSS from tab titles). */
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function formatDate(ms) {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── State ──────────────────────────────────────────────────────────────────────

let allSessions = [];   // array, newest first
let searchTerm = '';

// ─── Modal (replaces prompt()/confirm(), which don't work in MV3 popups) ─────────

const overlay = $('#modal-overlay');

/**
 * Show a modal.
 *  - prompt: { title, defaultValue?, placeholder? } → resolves to string or null
 *  - confirm: { title, message, confirmLabel? }     → resolves to true/false
 */
function showModal({ title, message, input, defaultValue = '', placeholder = '', confirmLabel = 'OK' }) {
  return new Promise((resolve) => {
    $('#modal-title').textContent = title;

    const msgEl = $('#modal-message');
    msgEl.textContent = message ?? '';
    msgEl.hidden = !message;

    const inputEl = $('#modal-input');
    inputEl.hidden = !input;
    inputEl.value = defaultValue;
    inputEl.placeholder = placeholder;

    $('#modal-confirm').textContent = confirmLabel;
    overlay.hidden = false;
    if (input) { inputEl.focus(); inputEl.select(); }
    else { $('#modal-confirm').focus(); }

    function cleanup(result) {
      overlay.hidden = true;
      $('#modal-confirm').removeEventListener('click', onConfirm);
      $('#modal-cancel').removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    const onConfirm = () => cleanup(input ? inputEl.value.trim() : true);
    const onCancel = () => cleanup(input ? null : false);
    const onBackdrop = (e) => { if (e.target === overlay) onCancel(); };
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && input) onConfirm();
    };

    $('#modal-confirm').addEventListener('click', onConfirm);
    $('#modal-cancel').addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

// ─── Sessions: load + render ─────────────────────────────────────────────────────

async function loadSessions() {
  const sessions = await api.getSessions();
  allSessions = Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);
  renderSessions();
}

function filteredSessions() {
  const q = searchTerm.toLowerCase();
  if (!q) return allSessions;
  return allSessions.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    s.tabs.some((t) =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.url || '').toLowerCase().includes(q)
    )
  );
}

function renderSessions() {
  const list = $('#sessions-list');
  const items = filteredSessions();

  if (allSessions.length === 0) {
    list.innerHTML = '<p class="empty">No saved sessions yet.<br/>Click “Save current session” to start.</p>';
    return;
  }
  if (items.length === 0) {
    list.innerHTML = `<p class="empty">Nothing matches “${esc(searchTerm)}”.</p>`;
    return;
  }

  list.innerHTML = items.map((s) => `
    <div class="session-card" data-id="${esc(s.id)}">
      <div class="session-info">
        <span class="session-name">
          ${s.isAuto ? '<span class="badge-auto" title="Created by autosave">auto</span>' : ''}
          ${esc(s.name)}
        </span>
        <span class="session-meta">${s.tabs.length} tab${s.tabs.length === 1 ? '' : 's'} · ${esc(formatDate(s.createdAt))}</span>
      </div>
      <div class="session-actions">
        <button class="btn-restore" data-id="${esc(s.id)}" title="Open all tabs">Restore</button>
        <button class="btn-delete icon-btn" data-id="${esc(s.id)}" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-restore').forEach((btn) =>
    btn.addEventListener('click', () => onRestore(btn.dataset.id)));
  list.querySelectorAll('.btn-delete').forEach((btn) =>
    btn.addEventListener('click', () => onDelete(btn.dataset.id)));
}

// ─── Actions ─────────────────────────────────────────────────────────────────────

async function onSave() {
  const defaultName = `Session — ${formatDate(Date.now())}`;
  const name = await showModal({
    title: 'Save current session',
    input: true,
    defaultValue: defaultName,
    placeholder: 'Session name',
    confirmLabel: 'Save',
  });
  if (name === null) return;            // cancelled
  await api.saveSession(name || defaultName);
  await loadSessions();
}

async function onRestore(id) {
  await api.restoreSession(id);
  // Real engine opens the tabs; nothing more to do in the popup.
}

async function onDelete(id) {
  const session = allSessions.find((s) => s.id === id);
  const ok = await showModal({
    title: 'Delete session?',
    message: `“${session?.name ?? 'this session'}” will be permanently removed.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  await api.deleteSession(id);
  await loadSessions();
}

// ─── Settings view ───────────────────────────────────────────────────────────────

function showView(name) {
  $('#view-main').hidden = name !== 'main';
  $('#view-settings').hidden = name !== 'settings';
}

let settingsStatusTimer = null;
function flashSaved() {
  const el = $('#settings-status');
  el.hidden = false;
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => { el.hidden = true; }, 1500);
}

async function openSettings() {
  const s = await api.getSettings();
  $('#set-autosave').checked = !!s.autosaveEnabled;
  $('#set-interval').value = s.autosaveInterval;
  $('#set-max-auto').value = s.maxAutoSessions;
  showView('settings');
}

async function saveSettings() {
  const partial = {
    autosaveEnabled: $('#set-autosave').checked,
    autosaveInterval: Math.max(1, Number($('#set-interval').value) || 1),
    maxAutoSessions: Math.max(1, Number($('#set-max-auto').value) || 1),
  };
  await api.updateSettings(partial);
  flashSaved();
}

// ─── Wire up ───────────────────────────────────────────────────────────────────

$('#btn-save').addEventListener('click', onSave);
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-back').addEventListener('click', () => { showView('main'); loadSessions(); });

$('#search').addEventListener('input', (e) => {
  searchTerm = e.target.value;
  renderSessions();
});

['#set-autosave', '#set-interval', '#set-max-auto'].forEach((sel) =>
  $(sel).addEventListener('change', saveSettings));

// Show a small badge while the mock backend is in use (dev/preview only).
if (api.USING_MOCK) $('#mock-badge').hidden = false;

loadSessions();
