import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as store from './storage.js';
import * as spaces from './spaces.js';

function makeSession(id, name) {
  const now = Date.now();
  return { id, name, createdAt: now, updatedAt: now, tabs: [], isAuto: false };
}

beforeEach(() => {
  installChromeMock();
});

describe('space CRUD', () => {
  it('creates, reads, updates, and deletes a space', async () => {
    const sp = await spaces.createSpace('Work', { color: '#00f', icon: '💼' });
    expect(sp.id).toBeTruthy();
    expect(await spaces.getSpace(sp.id)).toMatchObject({ name: 'Work', icon: '💼' });

    await spaces.updateSpace(sp.id, { name: 'Work 2' });
    expect((await spaces.getSpace(sp.id)).name).toBe('Work 2');

    await spaces.deleteSpace(sp.id);
    expect(await spaces.getSpace(sp.id)).toBeNull();
  });

  it('updateSpace throws for a missing space', async () => {
    await expect(spaces.updateSpace('ghost', { name: 'x' })).rejects.toThrow(/not found/);
  });
});

describe('assignment + queries', () => {
  it('assigns sessions and folders to a space and queries them', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.saveSession(makeSession('b', 'B'));
    const folder = await store.createFolder('Docs');
    const sp = await spaces.createSpace('Project X');

    await spaces.assignSessionToSpace('a', sp.id);
    await spaces.assignFolderToSpace(folder.id, sp.id);

    expect((await spaces.getSessionsInSpace(sp.id)).map(s => s.id)).toEqual(['a']);
    expect((await spaces.getSessionsInSpace(null)).map(s => s.id)).toEqual(['b']);
    expect((await spaces.getFoldersInSpace(sp.id)).map(f => f.id)).toEqual([folder.id]);
  });

  it('refuses to assign to a non-existent space', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await expect(spaces.assignSessionToSpace('a', 'ghost')).rejects.toThrow(/not found/);
  });

  it('clears a session assignment with null', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const sp = await spaces.createSpace('S');
    await spaces.assignSessionToSpace('a', sp.id);
    await spaces.assignSessionToSpace('a', null);
    expect((await store.getSession('a')).spaceId).toBeNull();
  });

  it('reports member counts (folders + sessions) per space', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const folder = await store.createFolder('F');
    const sp = await spaces.createSpace('S');
    await spaces.assignSessionToSpace('a', sp.id);
    await spaces.assignFolderToSpace(folder.id, sp.id);

    const counts = await spaces.getSpaceCounts();
    expect(counts[sp.id]).toEqual({ folders: 1, sessions: 1 });
  });
});

describe('deleteSpace never loses contents', () => {
  it('reassigns its sessions and folders to unassigned', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const folder = await store.createFolder('F');
    const sp = await spaces.createSpace('Temp');
    await spaces.assignSessionToSpace('a', sp.id);
    await spaces.assignFolderToSpace(folder.id, sp.id);

    await spaces.deleteSpace(sp.id);

    expect(await spaces.getSpace(sp.id)).toBeNull();
    expect(await store.getSession('a')).not.toBeNull();
    expect((await store.getSession('a')).spaceId).toBeNull();
    expect((await store.getFolder(folder.id)).spaceId).toBeNull();
  });
});

describe('spaces in full-vault backup', () => {
  it('export includes spaces and import restores them', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const sp = await spaces.createSpace('Work');

    const blob = JSON.parse(JSON.stringify(await store.exportData()));
    expect(blob.spaces[sp.id]).toBeDefined();

    await chrome.storage.local.set({ spaces: {} });
    await store.importData(blob, 'replace');
    expect(await spaces.getSpace(sp.id)).not.toBeNull();
  });
});
