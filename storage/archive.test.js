import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as store from './storage.js';
import { compressToBase64, decompressFromBase64 } from './gzip.js';

function makeTab(url) {
  return { url, title: url, favIconUrl: '', pinned: false, index: 0 };
}

function makeSession(id, name, createdAt = Date.now(), extra = {}) {
  return { id, name, createdAt, updatedAt: createdAt, tabs: [makeTab('https://x.com')], isAuto: false, ...extra };
}

beforeEach(() => {
  installChromeMock();
});

// ─── gzip + base64 round-trip ──────────────────────────────────────────────────────

describe('compressToBase64 / decompressFromBase64', () => {
  it('round-trips arbitrary JSON', async () => {
    const text = JSON.stringify({ a: 1, b: 'hello', list: [1, 2, 3] });
    const b64 = await compressToBase64(text);
    expect(typeof b64).toBe('string');
    expect(await decompressFromBase64(b64)).toBe(text);
  });
});

// ─── Archive ────────────────────────────────────────────────────────────────────

describe('archive', () => {
  it('archives a session out of the active set and lists metadata only', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const entry = await store.archiveSession('a');

    expect(await store.getSession('a')).toBeNull();
    expect(entry).toMatchObject({ id: 'a', name: 'A', tabCount: 1 });
    expect(typeof entry.archivedAt).toBe('number');

    const list = await store.listArchived();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('data'); // payload stays compressed/out of listing
  });

  it('restores an archived session intact', async () => {
    const original = makeSession('a', 'A', 123, { tags: ['x'] });
    await store.saveSession(original);
    await store.archiveSession('a');

    const restored = await store.restoreArchived('a');
    expect(restored).toEqual(original);
    expect(await store.getSession('a')).toEqual(original);
    expect(await store.listArchived()).toHaveLength(0);
  });

  it('permanently deletes an archived session', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.archiveSession('a');
    await store.deleteArchived('a');
    expect(await store.listArchived()).toHaveLength(0);
  });

  it('throws when restoring a missing archived id', async () => {
    await expect(store.restoreArchived('nope')).rejects.toThrow(/not found/);
  });
});

// ─── Auto-archive ─────────────────────────────────────────────────────────────────

describe('autoArchiveOldSessions', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('archives old sessions beyond keepRecent, skipping locked', async () => {
    const now = Date.now();
    await store.saveSession(makeSession('recent', 'Recent', now));
    await store.saveSession(makeSession('old1', 'Old1', now - 40 * DAY));
    await store.saveSession(makeSession('old2', 'Old2', now - 50 * DAY));
    await store.saveSession(makeSession('locked-old', 'Locked', now - 60 * DAY, { locked: true }));

    const archived = await store.autoArchiveOldSessions({ olderThanDays: 30, keepRecent: 1 });

    expect(archived).toBe(2); // old1 + old2, not recent (keepRecent) nor locked
    const ids = (await store.listArchived()).map(e => e.id).sort();
    expect(ids).toEqual(['old1', 'old2']);
    expect(await store.getSession('locked-old')).not.toBeNull();
    expect(await store.getSession('recent')).not.toBeNull();
  });

  it('keeps the N most recent regardless of age', async () => {
    const now = Date.now();
    await store.saveSession(makeSession('a', 'A', now - 100 * DAY));
    await store.saveSession(makeSession('b', 'B', now - 200 * DAY));

    const archived = await store.autoArchiveOldSessions({ olderThanDays: 30, keepRecent: 50 });
    expect(archived).toBe(0);
  });
});
