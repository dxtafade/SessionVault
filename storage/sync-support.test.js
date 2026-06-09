import { describe, it, expect } from 'vitest';
import { mergeByUpdatedAt, mergeVault, VAULT_COLLECTIONS } from './sync-support.js';

const rec = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });

describe('mergeByUpdatedAt', () => {
  it('keeps the newer record per id (remote wins when newer)', () => {
    const local = { a: rec('a', 100, { v: 'local' }) };
    const remote = { a: rec('a', 200, { v: 'remote' }) };
    expect(mergeByUpdatedAt(local, remote).a.v).toBe('remote');
  });

  it('keeps local when it is newer', () => {
    const local = { a: rec('a', 300, { v: 'local' }) };
    const remote = { a: rec('a', 200, { v: 'remote' }) };
    expect(mergeByUpdatedAt(local, remote).a.v).toBe('local');
  });

  it('unions ids present on only one side', () => {
    const local = { a: rec('a', 1) };
    const remote = { b: rec('b', 1) };
    expect(Object.keys(mergeByUpdatedAt(local, remote)).sort()).toEqual(['a', 'b']);
  });

  it('treats a missing updatedAt as oldest', () => {
    const local = { a: { id: 'a', v: 'local' } };          // no updatedAt
    const remote = { a: rec('a', 1, { v: 'remote' }) };
    expect(mergeByUpdatedAt(local, remote).a.v).toBe('remote');
  });

  it('does not mutate its inputs', () => {
    const local = { a: rec('a', 1) };
    const remote = { a: rec('a', 2) };
    mergeByUpdatedAt(local, remote);
    expect(local.a.updatedAt).toBe(1);
  });

  it('handles empty/omitted args', () => {
    expect(mergeByUpdatedAt()).toEqual({});
  });
});

describe('mergeVault', () => {
  it('merges every vault collection last-write-wins', () => {
    const local = {
      sessions: { s1: rec('s1', 100, { name: 'old' }) },
      folders: { f1: rec('f1', 100) },
      smartFolders: {},
      spaces: { sp1: rec('sp1', 500) },
    };
    const remote = {
      sessions: { s1: rec('s1', 200, { name: 'new' }), s2: rec('s2', 1) },
      folders: {},
      smartFolders: { sf1: rec('sf1', 1) },
      spaces: { sp1: rec('sp1', 200) },
    };

    const merged = mergeVault(local, remote);
    expect(merged.sessions.s1.name).toBe('new');     // remote newer
    expect(merged.sessions.s2).toBeDefined();         // remote-only added
    expect(merged.folders.f1).toBeDefined();          // local-only kept
    expect(merged.smartFolders.sf1).toBeDefined();    // remote-only added
    expect(merged.spaces.sp1.updatedAt).toBe(500);    // local newer kept
  });

  it('always returns all vault collections, even from empty input', () => {
    expect(Object.keys(mergeVault({}, {})).sort()).toEqual([...VAULT_COLLECTIONS].sort());
  });

  it('ignores unknown extra keys', () => {
    const merged = mergeVault({ bogus: { x: 1 } }, { sessions: { a: rec('a', 1) } });
    expect(merged.bogus).toBeUndefined();
    expect(merged.sessions.a).toBeDefined();
  });
});
