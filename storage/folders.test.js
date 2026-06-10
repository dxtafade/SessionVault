import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as store from './storage.js';

function makeSession(id, name) {
  const now = Date.now();
  return { id, name, createdAt: now, updatedAt: now, tabs: [], isAuto: false };
}

beforeEach(() => {
  installChromeMock();
});

// ─── Folders ────────────────────────────────────────────────────────────────────

describe('folders', () => {
  it('creates, reads, and renames a folder', async () => {
    const f = await store.createFolder('Work', { color: '#f00' });
    expect(f.id).toBeTruthy();
    expect(await store.getFolder(f.id)).toMatchObject({ name: 'Work', color: '#f00' });

    await store.renameFolder(f.id, 'Work 2');
    expect((await store.getFolder(f.id)).name).toBe('Work 2');
  });

  it('sanitizes folder color — keeps hex, drops anything else', async () => {
    expect((await store.createFolder('A', { color: '#3af' })).color).toBe('#3af');
    expect((await store.createFolder('B', { color: '#2D9D78' })).color).toBe('#2D9D78');
    expect((await store.createFolder('C', { color: 'red; background:url(x)' })).color).toBeNull();
    expect((await store.createFolder('D', { color: '<script>' })).color).toBeNull();
  });

  it('assigns a session to a folder and lists by folder', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.saveSession(makeSession('b', 'B'));
    const f = await store.createFolder('Project');

    await store.assignSessionToFolder('a', f.id);

    expect((await store.getSessionsInFolder(f.id)).map(s => s.id)).toEqual(['a']);
    expect((await store.getSessionsInFolder(null)).map(s => s.id)).toEqual(['b']);
  });

  it('refuses to assign to a non-existent folder', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await expect(store.assignSessionToFolder('a', 'ghost')).rejects.toThrow(/not found/);
  });

  it('clears a folder assignment with null', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const f = await store.createFolder('F');
    await store.assignSessionToFolder('a', f.id);
    await store.assignSessionToFolder('a', null);
    expect((await store.getSession('a')).folderId).toBeNull();
  });

  it('deleting a folder reassigns its sessions to unfiled (never loses them)', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const f = await store.createFolder('Temp');
    await store.assignSessionToFolder('a', f.id);

    await store.deleteFolder(f.id);

    expect(await store.getFolder(f.id)).toBeNull();
    expect(await store.getSession('a')).not.toBeNull();
    expect((await store.getSession('a')).folderId).toBeNull();
  });
});

// ─── Tags ─────────────────────────────────────────────────────────────────────────

describe('tags', () => {
  it('adds tags (normalized, de-duplicated) and lists them', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.addTag('a', 'Research');
    await store.addTag('a', 'research'); // dup after normalize
    await store.addTag('a', '  Reading ');

    expect((await store.getSession('a')).tags.sort()).toEqual(['reading', 'research']);
    expect(await store.getAllTags()).toEqual(['reading', 'research']);
  });

  it('rejects an empty tag', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await expect(store.addTag('a', '   ')).rejects.toThrow(/empty/);
  });

  it('removes a tag', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.addTag('a', 'x');
    await store.removeTag('a', 'X'); // case-insensitive
    expect((await store.getSession('a')).tags).toEqual([]);
  });

  it('finds sessions by tag, newest-first', async () => {
    await store.saveSession({ ...makeSession('old', 'Old'), createdAt: 1 });
    await store.saveSession({ ...makeSession('new', 'New'), createdAt: 2 });
    await store.addTag('old', 'keep');
    await store.addTag('new', 'keep');

    expect((await store.getSessionsByTag('keep')).map(s => s.id)).toEqual(['new', 'old']);
  });
});
