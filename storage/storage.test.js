import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as store from './storage.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeTab(url, title = url) {
  return { url, title, favIconUrl: '', pinned: false, index: 0 };
}

function makeSession(id, name, tabs = [], extra = {}) {
  const now = Date.now();
  return { id, name, createdAt: now, updatedAt: now, tabs, isAuto: false, ...extra };
}

beforeEach(() => {
  installChromeMock();
});

// ─── Sessions CRUD ────────────────────────────────────────────────────────────

describe('sessions CRUD', () => {
  it('saves and reads back a session', async () => {
    const s = makeSession('a', 'Work', [makeTab('https://example.com')]);
    await store.saveSession(s);

    expect(await store.getSession('a')).toEqual(s);
    expect(Object.keys(await store.getAllSessions())).toEqual(['a']);
  });

  it('returns null for a missing session', async () => {
    expect(await store.getSession('nope')).toBeNull();
  });

  it('deletes a session', async () => {
    await store.saveSession(makeSession('a', 'Work'));
    await store.deleteSession('a');
    expect(await store.getSession('a')).toBeNull();
  });

  it('clears all sessions', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.saveSession(makeSession('b', 'B'));
    await store.clearAllSessions();
    expect(await store.getAllSessions()).toEqual({});
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

describe('settings', () => {
  it('returns defaults when nothing stored', async () => {
    const s = await store.getSettings();
    expect(s.autosaveEnabled).toBe(true);
    expect(s.autosaveInterval).toBe(10);
    expect(s.maxAutoSessions).toBe(5);
  });

  it('merges partial updates over defaults', async () => {
    await store.updateSettings({ autosaveInterval: 30 });
    const s = await store.getSettings();
    expect(s.autosaveInterval).toBe(30);
    expect(s.autosaveEnabled).toBe(true); // default preserved
  });
});

// ─── Search ───────────────────────────────────────────────────────────────────

describe('searchSessions', () => {
  beforeEach(async () => {
    await store.saveSession(
      makeSession('a', 'Work stuff', [makeTab('https://github.com', 'GitHub')])
    );
    await store.saveSession(
      makeSession('b', 'Holiday', [makeTab('https://booking.com', 'Booking')])
    );
  });

  it('matches by session name', async () => {
    const res = await store.searchSessions('holiday');
    expect(res.map(s => s.id)).toEqual(['b']);
  });

  it('matches by tab title', async () => {
    const res = await store.searchSessions('github');
    expect(res.map(s => s.id)).toEqual(['a']);
  });

  it('matches by tab url', async () => {
    const res = await store.searchSessions('booking.com');
    expect(res.map(s => s.id)).toEqual(['b']);
  });

  it('is case-insensitive', async () => {
    expect((await store.searchSessions('WORK')).map(s => s.id)).toEqual(['a']);
  });

  it('returns all sessions newest-first for an empty query', async () => {
    const res = await store.searchSessions('   ');
    expect(res).toHaveLength(2);
  });
});

// ─── Deduplication ──────────────────────────────────────────────────────────────

describe('deduplicateTabs', () => {
  it('drops duplicate urls, keeping first occurrence', () => {
    const s = makeSession('a', 'A', [
      makeTab('https://x.com'),
      makeTab('https://y.com'),
      makeTab('https://x.com'),
    ]);
    const result = store.deduplicateTabs(s);
    expect(result.tabs.map(t => t.url)).toEqual(['https://x.com', 'https://y.com']);
  });

  it('does not mutate the input session', () => {
    const s = makeSession('a', 'A', [makeTab('https://x.com'), makeTab('https://x.com')]);
    store.deduplicateTabs(s);
    expect(s.tabs).toHaveLength(2);
  });
});

describe('findDuplicateSessions', () => {
  it('groups sessions with identical tab sets regardless of order', async () => {
    await store.saveSession(
      makeSession('a', 'A', [makeTab('https://x.com'), makeTab('https://y.com')])
    );
    await store.saveSession(
      makeSession('b', 'B', [makeTab('https://y.com'), makeTab('https://x.com')])
    );
    await store.saveSession(makeSession('c', 'C', [makeTab('https://z.com')]));

    const groups = await store.findDuplicateSessions();
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual(['a', 'b']);
  });
});

// ─── Export / Import ──────────────────────────────────────────────────────────

describe('export / import', () => {
  it('exportData returns sessions + settings + metadata', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const blob = await store.exportData();
    expect(blob.sessions.a).toBeDefined();
    expect(blob.settings).toBeDefined();
    expect(blob._schemaVersion).toBe(3);
    expect(typeof blob._exportedAt).toBe('number');
  });

  it('importData merges by default', async () => {
    await store.saveSession(makeSession('a', 'Existing'));
    const blob = { sessions: { b: makeSession('b', 'Imported') } };

    const res = await store.importData(blob);
    expect(res).toEqual({ imported: 1, skipped: 0 });
    expect(Object.keys(await store.getAllSessions()).sort()).toEqual(['a', 'b']);
  });

  it('importData replace mode wipes existing sessions first', async () => {
    await store.saveSession(makeSession('a', 'Existing'));
    const blob = { sessions: { b: makeSession('b', 'Imported') } };

    await store.importData(blob, 'replace');
    expect(Object.keys(await store.getAllSessions())).toEqual(['b']);
  });

  it('skips malformed sessions instead of importing them', async () => {
    const blob = {
      sessions: {
        good: makeSession('good', 'Good'),
        bad: { id: 'bad' }, // missing required fields
      },
    };
    const res = await store.importData(blob);
    expect(res).toEqual({ imported: 1, skipped: 1 });
  });

  it('throws on a blob with no sessions', async () => {
    await expect(store.importData({})).rejects.toThrow(/no sessions/);
  });

  it('exportSessionAsText returns a newline-separated url list', async () => {
    await store.saveSession(
      makeSession('a', 'A', [makeTab('https://x.com'), makeTab('https://y.com')])
    );
    expect(await store.exportSessionAsText('a')).toBe('https://x.com\nhttps://y.com');
  });

  it('export includes folders + smartFolders; import restores them', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const folder = await store.createFolder('Work');
    await chrome.storage.local.set({ smartFolders: { sf1: { id: 'sf1', name: 'Dev' } } });

    const blob = JSON.parse(JSON.stringify(await store.exportData()));
    expect(blob.folders[folder.id]).toBeDefined();
    expect(blob.smartFolders.sf1).toBeDefined();

    // Wipe organization, then restore from the backup.
    await chrome.storage.local.set({ folders: {}, smartFolders: {} });
    await store.importData(blob, 'replace');

    expect(await store.getFolder(folder.id)).not.toBeNull();
    const { smartFolders } = await chrome.storage.local.get('smartFolders');
    expect(smartFolders.sf1).toBeDefined();
  });

  it('merge-imports folders without dropping existing ones', async () => {
    const keep = await store.createFolder('Keep');
    const blob = { sessions: {}, folders: { f2: { id: 'f2', name: 'New', createdAt: 1, updatedAt: 1 } } };
    await store.importData(blob, 'merge');

    const folders = await store.getFolders();
    expect(Object.keys(folders).sort()).toEqual([keep.id, 'f2'].sort());
  });

  it('applies the whole vault in a single atomic write (sync-persist safety)', async () => {
    const blob = {
      sessions: { a: makeSession('a', 'A') },
      folders: { f1: { id: 'f1', name: 'F', createdAt: 1, updatedAt: 1 } },
      smartFolders: { sf1: { id: 'sf1', name: 'SF' } },
      spaces: { sp1: { id: 'sp1', name: 'SP' } },
    };

    const realSet = chrome.storage.local.set;
    let setCalls = 0;
    chrome.storage.local.set = async (...args) => { setCalls++; return realSet(...args); };
    try {
      await store.importData(blob, 'replace');
    } finally {
      chrome.storage.local.set = realSet;
    }

    expect(setCalls).toBe(1);
    // ...and everything still landed
    expect(await store.getSession('a')).not.toBeNull();
    expect(await store.getFolder('f1')).not.toBeNull();
    const { smartFolders, spaces } = await chrome.storage.local.get(['smartFolders', 'spaces']);
    expect(smartFolders.sf1).toBeDefined();
    expect(spaces.sp1).toBeDefined();
  });
});

// ─── Storage usage ──────────────────────────────────────────────────────────────

describe('getStorageUsage', () => {
  it('reports used/quota/percent', async () => {
    await store.saveSession(makeSession('a', 'A', [makeTab('https://x.com')]));
    const usage = await store.getStorageUsage();
    expect(usage.used).toBeGreaterThan(0);
    expect(usage.quota).toBe(10_485_760);
    expect(usage.percent).toBeGreaterThanOrEqual(0);
  });
});

describe('getStorageHealth', () => {
  it('is ok well under quota with no suggestions', async () => {
    await store.saveSession(makeSession('a', 'A', [makeTab('https://x.com')]));
    const health = await store.getStorageHealth();
    expect(health.level).toBe('ok');
    expect(health.suggestions).toEqual([]);
  });

  it('warns and suggests actions as quota fills', async () => {
    // Shrink the quota so any saved data crosses the threshold.
    chrome.storage.local.QUOTA_BYTES = 50;
    await store.saveSession(makeSession('a', 'A', [makeTab('https://example.com/some/path')]));

    const health = await store.getStorageHealth();
    expect(['warning', 'critical']).toContain(health.level);
    expect(health.suggestions.length).toBeGreaterThan(0);
    expect(health.suggestions.some(s => /archive/i.test(s))).toBe(true);
  });

  it('suggests emptying the trash when it has items', async () => {
    chrome.storage.local.QUOTA_BYTES = 50;
    await store.saveSession(makeSession('a', 'A'));
    await store.saveSession(makeSession('b', 'B'));
    await store.trashSession('b');

    const health = await store.getStorageHealth();
    expect(health.suggestions.some(s => /trash/i.test(s))).toBe(true);
  });
});

describe('quota guard (_write overflow)', () => {
  it('rethrows quota errors with a clean QUOTA_EXCEEDED prefix', async () => {
    const realSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => {
      throw new Error('QUOTA_BYTES quota exceeded');
    };
    try {
      await expect(store.saveSession(makeSession('a', 'A'))).rejects.toThrow(/^QUOTA_EXCEEDED/);
    } finally {
      chrome.storage.local.set = realSet;
    }
  });

  it('lets non-quota errors through unchanged', async () => {
    const realSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('disk on fire'); };
    try {
      await expect(store.saveSession(makeSession('a', 'A'))).rejects.toThrow(/disk on fire/);
    } finally {
      chrome.storage.local.set = realSet;
    }
  });
});

describe('getStorageStats', () => {
  it('aggregates session, tab, and trash counts', async () => {
    await store.saveSession(
      makeSession('a', 'Manual', [makeTab('https://x.com'), makeTab('https://y.com')])
    );
    await store.saveSession(
      makeSession('b', 'Auto', [makeTab('https://z.com')], { isAuto: true })
    );
    await store.saveSession(makeSession('c', 'Locked', [], { locked: true }));
    await store.saveSession(makeSession('d', 'Trashed'));
    await store.trashSession('d');

    const stats = await store.getStorageStats();
    expect(stats.sessions).toEqual({ total: 3, auto: 1, manual: 2, locked: 1 });
    expect(stats.totalTabs).toBe(3);
    expect(stats.trashCount).toBe(1);
    expect(stats.usage.quota).toBe(10_485_760);
  });

  it('reports zeroes for empty storage', async () => {
    const stats = await store.getStorageStats();
    expect(stats.sessions).toEqual({ total: 0, auto: 0, manual: 0, locked: 0 });
    expect(stats.totalTabs).toBe(0);
    expect(stats.trashCount).toBe(0);
  });
});

// ─── Lock ───────────────────────────────────────────────────────────────────────

describe('lock / unlock', () => {
  it('locks and unlocks a session', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.lockSession('a');
    expect((await store.getSession('a')).locked).toBe(true);
    await store.unlockSession('a');
    expect((await store.getSession('a')).locked).toBe(false);
  });

  it('throws when locking a missing session', async () => {
    await expect(store.lockSession('nope')).rejects.toThrow(/not found/);
  });
});

// ─── Trash ────────────────────────────────────────────────────────────────────

describe('trash', () => {
  it('moves a session to trash and out of the active set', async () => {
    await store.saveSession(makeSession('a', 'A'));
    const entry = await store.trashSession('a');

    expect(await store.getSession('a')).toBeNull();
    expect(typeof entry.trashedAt).toBe('number');
    expect((await store.getTrash()).a).toBeDefined();
  });

  it('refuses to trash a locked session without force', async () => {
    await store.saveSession(makeSession('a', 'A', [], { locked: true }));
    await expect(store.trashSession('a')).rejects.toThrow(/locked/);
    expect(await store.getSession('a')).not.toBeNull();
  });

  it('trashes a locked session when forced', async () => {
    await store.saveSession(makeSession('a', 'A', [], { locked: true }));
    await store.trashSession('a', { force: true });
    expect(await store.getSession('a')).toBeNull();
  });

  it('restores a session from trash without the trashedAt marker', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.trashSession('a');
    const restored = await store.restoreFromTrash('a');

    expect(restored.trashedAt).toBeUndefined();
    expect(await store.getSession('a')).not.toBeNull();
    expect((await store.getTrash()).a).toBeUndefined();
  });

  it('empties the trash', async () => {
    await store.saveSession(makeSession('a', 'A'));
    await store.trashSession('a');
    await store.emptyTrash();
    expect(await store.getTrash()).toEqual({});
  });

  it('purges only trash older than the TTL', async () => {
    await store.saveSession(makeSession('old', 'Old'));
    await store.saveSession(makeSession('new', 'New'));
    await store.trashSession('old');
    await store.trashSession('new');

    // Backdate the "old" entry past the 30-day TTL.
    const trash = await store.getTrash();
    trash.old.trashedAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
    await chrome.storage.local.set({ trash });

    const purged = await store.purgeExpiredTrash();
    expect(purged).toBe(1);
    expect((await store.getTrash()).old).toBeUndefined();
    expect((await store.getTrash()).new).toBeDefined();
  });
});

// ─── Migration ──────────────────────────────────────────────────────────────────

describe('migrateIfNeeded', () => {
  it('stamps the schema version', async () => {
    await store.migrateIfNeeded();
    const { _schemaVersion } = await chrome.storage.local.get('_schemaVersion');
    expect(_schemaVersion).toBe(3);
  });
});
