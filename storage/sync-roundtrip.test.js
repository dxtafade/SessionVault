/**
 * End-to-end test of the STORAGE side of cloud sync, against a fake remote.
 *
 * Proves that the chain Core's sync.js composes — encrypt → push → pull →
 * decrypt → mergeVault → importData — round-trips correctly across two
 * "devices", using only storage-owned pieces (crypto, sync-support, storage).
 * The only thing left for Core is the real transport (Supabase fetch); this
 * locks down everything on our side so that's the sole remaining variable.
 *
 * Two devices are modelled by reinstalling a fresh chrome mock (separate local
 * storage) while sharing one `remote` blob slot — exactly what Supabase is to
 * us: an opaque per-user string store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as store from './storage.js';
import { encryptBlob, decryptBlob } from './crypto.js';
import { mergeVault } from './sync-support.js';

const PASS = 'correct horse battery staple';

function sess(id, updatedAt, name = id) {
  return {
    id, name,
    createdAt: updatedAt,
    updatedAt,
    tabs: [{ url: 'https://x.com', title: 'x', favIconUrl: '', pinned: false, index: 0 }],
    isAuto: false,
  };
}

// Mirrors what Core's sync.js does, minus the network: push encrypts the whole
// vault into the remote slot; pullAndMerge decrypts, LWW-merges, and persists.
async function push(remote, passphrase) {
  remote.blob = await encryptBlob(await store.exportData(), passphrase);
}
async function pullAndMerge(remote, passphrase) {
  const remoteVault = remote.blob ? await decryptBlob(remote.blob, passphrase) : { sessions: {} };
  const merged = mergeVault(await store.exportData(), remoteVault);
  await store.importData(merged, 'replace');
}

beforeEach(() => {
  installChromeMock();
});

describe('cloud-sync storage chain (fake remote)', () => {
  it('propagates a vault from device A to a fresh device B', async () => {
    // Device A
    await store.saveSession(sess('s1', 100));
    await store.createFolder('Work');
    const remote = { blob: null };
    await push(remote, PASS);

    // The remote only ever holds opaque ciphertext.
    expect(typeof remote.blob).toBe('string');
    expect(remote.blob).not.toContain('s1');

    // Device B (fresh storage) pulls and merges.
    installChromeMock();
    expect(await store.getSession('s1')).toBeNull(); // starts empty
    await pullAndMerge(remote, PASS);

    expect(await store.getSession('s1')).not.toBeNull();
    expect(Object.values(await store.getFolders()).some(f => f.name === 'Work')).toBe(true);
  });

  it('resolves conflicts last-write-wins — local newer is kept', async () => {
    // Device A pushes an older s1.
    await store.saveSession(sess('s1', 100, 'A-old'));
    const remote = { blob: null };
    await push(remote, PASS);

    // Device B has a newer s1, then syncs A down.
    installChromeMock();
    await store.saveSession(sess('s1', 200, 'B-new'));
    await pullAndMerge(remote, PASS);

    expect((await store.getSession('s1')).name).toBe('B-new');
  });

  it('resolves conflicts last-write-wins — remote newer wins', async () => {
    await store.saveSession(sess('s1', 500, 'A-new'));
    const remote = { blob: null };
    await push(remote, PASS);

    installChromeMock();
    await store.saveSession(sess('s1', 100, 'B-old'));
    await pullAndMerge(remote, PASS);

    expect((await store.getSession('s1')).name).toBe('A-new');
  });

  it('unions sessions unique to each device', async () => {
    await store.saveSession(sess('a', 1));
    const remote = { blob: null };
    await push(remote, PASS);

    installChromeMock();
    await store.saveSession(sess('b', 1));
    await pullAndMerge(remote, PASS);

    expect(Object.keys(await store.getAllSessions()).sort()).toEqual(['a', 'b']);
  });

  it('a wrong passphrase fails closed (DECRYPT_FAILED), no data written', async () => {
    await store.saveSession(sess('s1', 100));
    const remote = { blob: null };
    await push(remote, 'pass-one');

    installChromeMock();
    await store.saveSession(sess('local', 100));
    await expect(pullAndMerge(remote, 'pass-two')).rejects.toThrow(/^DECRYPT_FAILED/);
    // local data untouched by the failed sync
    expect(await store.getSession('local')).not.toBeNull();
  });
});
