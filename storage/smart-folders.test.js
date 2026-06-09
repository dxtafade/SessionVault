import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as store from './storage.js';
import * as sf from './smart-folders.js';

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

// ─── matchSession (pure) ─────────────────────────────────────────────────────────

describe('matchSession', () => {
  const session = makeSession('a', 'Work Research', [
    makeTab('https://github.com/x', 'GitHub'),
    makeTab('https://news.ycombinator.com', 'Hacker News'),
  ], { tags: ['dev', 'reading'], isAuto: false });

  it('matches a string contains on name (case-insensitive)', () => {
    expect(sf.matchSession(session, {
      match: 'all', conditions: [{ field: 'name', op: 'contains', value: 'research' }],
    })).toBe(true);
  });

  it('matches url across tabs', () => {
    expect(sf.matchSession(session, {
      match: 'all', conditions: [{ field: 'url', op: 'contains', value: 'ycombinator' }],
    })).toBe(true);
  });

  it('matches a tag equals', () => {
    expect(sf.matchSession(session, {
      match: 'all', conditions: [{ field: 'tag', op: 'equals', value: 'dev' }],
    })).toBe(true);
  });

  it('honours match: all (AND)', () => {
    const rules = {
      match: 'all',
      conditions: [
        { field: 'name', op: 'startsWith', value: 'Work' },
        { field: 'tabCount', op: 'gte', value: 2 },
      ],
    };
    expect(sf.matchSession(session, rules)).toBe(true);
    rules.conditions[1].value = 5;
    expect(sf.matchSession(session, rules)).toBe(false);
  });

  it('honours match: any (OR)', () => {
    expect(sf.matchSession(session, {
      match: 'any',
      conditions: [
        { field: 'name', op: 'equals', value: 'nope' },
        { field: 'tag', op: 'contains', value: 'read' },
      ],
    })).toBe(true);
  });

  it('matches number and boolean fields', () => {
    expect(sf.matchSession(session, {
      match: 'all', conditions: [{ field: 'tabCount', op: 'eq', value: 2 }],
    })).toBe(true);
    expect(sf.matchSession({ ...session, isAuto: true }, {
      match: 'all', conditions: [{ field: 'isAuto', op: 'eq', value: true }],
    })).toBe(true);
  });

  it('returns false for empty/missing rules', () => {
    expect(sf.matchSession(session, null)).toBe(false);
    expect(sf.matchSession(session, { match: 'all', conditions: [] })).toBe(false);
  });

  it('an unknown field never matches', () => {
    expect(sf.matchSession(session, {
      match: 'all', conditions: [{ field: 'bogus', op: 'contains', value: 'x' }],
    })).toBe(false);
  });
});

// ─── validateRules ───────────────────────────────────────────────────────────────

describe('validateRules', () => {
  it('accepts a valid rule group', () => {
    expect(sf.validateRules({
      match: 'any', conditions: [{ field: 'url', op: 'contains', value: 'x' }],
    })).toBe(true);
  });

  it('rejects bad match / empty conditions / unknown field / bad op / missing value', () => {
    expect(() => sf.validateRules({ match: 'maybe', conditions: [{ field: 'name', op: 'contains', value: 'x' }] })).toThrow(/match/);
    expect(() => sf.validateRules({ match: 'all', conditions: [] })).toThrow(/non-empty/);
    expect(() => sf.validateRules({ match: 'all', conditions: [{ field: 'nope', op: 'contains', value: 'x' }] })).toThrow(/unknown field/);
    expect(() => sf.validateRules({ match: 'all', conditions: [{ field: 'name', op: 'gt', value: 'x' }] })).toThrow(/invalid op/);
    expect(() => sf.validateRules({ match: 'all', conditions: [{ field: 'name', op: 'contains' }] })).toThrow(/value is required/);
  });
});

// ─── CRUD + evaluation ────────────────────────────────────────────────────────────

describe('smart folder CRUD + evaluation', () => {
  const devRule = { match: 'all', conditions: [{ field: 'url', op: 'contains', value: 'github.com' }] };

  it('creates, reads, updates, deletes', async () => {
    const f = await sf.createSmartFolder('Dev', devRule, { color: '#0f0' });
    expect(f.id).toBeTruthy();
    expect(await sf.getSmartFolder(f.id)).toMatchObject({ name: 'Dev', color: '#0f0' });

    await sf.updateSmartFolder(f.id, { name: 'Dev 2' });
    expect((await sf.getSmartFolder(f.id)).name).toBe('Dev 2');

    await sf.deleteSmartFolder(f.id);
    expect(await sf.getSmartFolder(f.id)).toBeNull();
  });

  it('rejects an invalid rule set on create and update', async () => {
    await expect(sf.createSmartFolder('Bad', { match: 'x', conditions: [] })).rejects.toThrow();
    const f = await sf.createSmartFolder('Ok', devRule);
    await expect(sf.updateSmartFolder(f.id, { rules: { match: 'all', conditions: [] } })).rejects.toThrow();
  });

  it('evaluates members against live sessions, newest-first', async () => {
    await store.saveSession({ ...makeSession('a', 'A', [makeTab('https://github.com/a')]), createdAt: 1 });
    await store.saveSession({ ...makeSession('b', 'B', [makeTab('https://github.com/b')]), createdAt: 2 });
    await store.saveSession(makeSession('c', 'C', [makeTab('https://example.com')]));

    const f = await sf.createSmartFolder('Dev', devRule);
    const members = await sf.evaluateSmartFolder(f.id);
    expect(members.map(s => s.id)).toEqual(['b', 'a']);
  });

  it('previews ad-hoc rules without saving', async () => {
    await store.saveSession(makeSession('a', 'A', [makeTab('https://github.com/a')]));
    const members = await sf.previewRules(devRule);
    expect(members.map(s => s.id)).toEqual(['a']);
    expect(Object.keys(await sf.getSmartFolders())).toEqual([]); // nothing persisted
  });

  it('reports per-folder member counts', async () => {
    await store.saveSession(makeSession('a', 'A', [makeTab('https://github.com/a')]));
    await store.saveSession(makeSession('b', 'B', [makeTab('https://example.com')]));
    const f = await sf.createSmartFolder('Dev', devRule);
    const counts = await sf.getSmartFolderCounts();
    expect(counts[f.id]).toBe(1);
  });
});
