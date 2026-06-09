/**
 * UI script — owned by the UI developer.
 *
 * Communicates with Core Engine exclusively via chrome.runtime.sendMessage.
 * See popup.html for the full message API reference.
 */

async function send(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, payload });
}

async function renderSessions() {
  const { sessions } = await send('GET_SESSIONS');
  const list = document.getElementById('sessions-list');

  const items = Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);

  if (items.length === 0) {
    list.innerHTML = '<p class="empty">No saved sessions yet.</p>';
    return;
  }

  list.innerHTML = items.map(s => `
    <div class="session-card" data-id="${s.id}">
      <div class="session-info">
        <span class="session-name">${s.name}</span>
        <span class="session-meta">${s.tabs.length} tabs · ${new Date(s.createdAt).toLocaleString()}</span>
      </div>
      <div class="session-actions">
        <button class="btn-restore" data-id="${s.id}">Restore</button>
        <button class="btn-delete" data-id="${s.id}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', async () => {
      await send('RESTORE_SESSION', { id: btn.dataset.id });
    });
  });

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await send('DELETE_SESSION', { id: btn.dataset.id });
      await renderSessions();
    });
  });
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const name = prompt('Session name:') ?? 'Unnamed session';
  await send('SAVE_SESSION', { name });
  await renderSessions();
});

renderSessions();
