import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import { encryptBlob } from '../storage/crypto.js';

// A fake Supabase: auth issues a token; /rest/v1/vaults upserts & returns one blob.
function fakeSupabase() {
  const state = { vault: null };
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  const fetchImpl = async (url, opts = {}) => {
    if (url.includes('/auth/v1/signup')) {
      return ok({ access_token: 'at-1', refresh_token: 'rt-1', user: { id: 'u-2', email: 'new@b.co' }, expires_in: 3600 });
    }
    if (url.includes('/auth/v1/token')) {
      return ok({ access_token: 'at-1', refresh_token: 'rt-1', user: { id: 'u-1', email: 'a@b.co' }, expires_in: 3600 });
    }
    if (url.includes('/rest/v1/vaults')) {
      if ((opts.method || 'GET') === 'POST') { state.vault = JSON.parse(opts.body).blob; return ok({}); }
      return ok(state.vault ? [{ blob: state.vault }] : []);
    }
    throw new Error('unexpected url ' + url);
  };
  return { state, fetchImpl };
}

let remote;
const realFetch = globalThis.fetch; // restore after, so we don't leak into other test files
beforeEach(() => {
  installChromeMock();
  remote = fakeSupabase();
  globalThis.fetch = vi.fn(remote.fetchImpl);
});
afterEach(() => { vi.restoreAllMocks(); globalThis.fetch = realFetch; });

const load = () => import('./sync.js');
const PASS = 'correct horse battery';
const session = (id, updatedAt) => ({ id, name: id, createdAt: 1, updatedAt, tabs: [], isAuto: false });
const vault = (sessions) => ({ sessions, folders: {}, smartFolders: {}, spaces: {} });

describe('sync transport + auth', () => {
  it('is a no-op when disabled', async () => {
    const sync = await load();
    const local = vault({ a: session('a', 100) });
    const { status, merged } = await sync.sync(local, { passphrase: PASS });
    expect(status.enabled).toBe(false);
    expect(merged).toBe(local);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enable() signs in, stores email, hides tokens from getStatus', async () => {
    const sync = await load();
    const status = await sync.enable({ email: 'a@b.co', password: 'pw' });
    expect(status.enabled).toBe(true);
    expect(status.email).toBe('a@b.co');
    expect(status.accessToken).toBeUndefined(); // never leaked publicly
  });

  it('enable({ signUp: true }) registers a new account', async () => {
    const sync = await load();
    const status = await sync.enable({ email: 'new@b.co', password: 'pw', signUp: true });
    expect(status.enabled).toBe(true);
    expect(status.email).toBe('new@b.co');
  });

  it('enable() rejects missing credentials', async () => {
    const sync = await load();
    await expect(sync.enable({ email: 'a@b.co' })).rejects.toThrow(/AUTH_FAILED/);
  });

  it('first sync pushes the local vault to an empty remote', async () => {
    const sync = await load();
    await sync.enable({ email: 'a@b.co', password: 'pw' });
    const local = vault({ a: session('a', 100) });
    const { status, merged } = await sync.sync(local, { passphrase: PASS });
    expect(status.state).toBe('idle');
    expect(status.lastSync).toBeTypeOf('number');
    expect(Object.keys(merged.sessions)).toEqual(['a']);
    expect(remote.state.vault).toBeTruthy(); // something was pushed
  });

  it('merges a newer remote record (last-write-wins) and pushes the union', async () => {
    const sync = await load();
    await sync.enable({ email: 'a@b.co', password: 'pw' });
    // Seed remote with a NEWER "a" and a remote-only "b", encrypted with the same pass.
    remote.state.vault = await encryptBlob(
      vault({ a: session('a', 999), b: session('b', 50) }), PASS,
    );
    const local = vault({ a: session('a', 100) }); // local "a" is older
    const { merged } = await sync.sync(local, { passphrase: PASS });
    expect(merged.sessions.a.updatedAt).toBe(999); // remote won
    expect(merged.sessions.b).toBeTruthy();         // remote-only pulled in
  });

  it('reports an error on a wrong passphrase, keeps local intact', async () => {
    const sync = await load();
    await sync.enable({ email: 'a@b.co', password: 'pw' });
    remote.state.vault = await encryptBlob(vault({ a: session('a', 1) }), 'a-different-pass');
    const local = vault({ z: session('z', 1) });
    const { status, merged } = await sync.sync(local, { passphrase: PASS });
    expect(status.state).toBe('error');
    expect(status.error).toMatch(/DECRYPT_FAILED/);
    expect(merged).toBe(local); // unchanged — nothing clobbered
  });

  it('errors (not throws) when syncing without a passphrase', async () => {
    const sync = await load();
    await sync.enable({ email: 'a@b.co', password: 'pw' });
    const { status } = await sync.sync(vault({}), {});
    expect(status.state).toBe('error');
    expect(status.error).toMatch(/Passphrase/);
  });
});
