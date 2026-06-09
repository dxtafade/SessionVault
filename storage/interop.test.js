/**
 * Cross-layer backup interop tests.
 *
 * The team currently has TWO export formats in the wild:
 *   - Storage (this layer):  exportData() -> { _exportedAt, _schemaVersion, sessions, settings }
 *   - Core Engine (main):    EXPORT_SESSIONS -> { version: 1, sessions }
 *
 * A backup made by one must be restorable by the other, or users lose tabs on
 * restore — the exact failure mode this product promises to prevent. These
 * tests lock that interop down. They touch ONLY storage-layer code; they
 * replicate Core's documented format as fixtures rather than importing it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as store from './storage.js';

function makeTab(url, title = url, extra = {}) {
  return { url, title, favIconUrl: '', pinned: false, index: 0, ...extra };
}

function makeSession(id, name, tabs = []) {
  const now = Date.now();
  return { id, name, createdAt: now, updatedAt: now, tabs, isAuto: false };
}

/** Mimics the Core Engine's EXPORT_SESSIONS output shape. */
function coreExport(sessions) {
  return { version: 1, sessions };
}

beforeEach(() => {
  installChromeMock();
});

// ─── Storage round-trip ─────────────────────────────────────────────────────────

describe('storage backup round-trip', () => {
  it('export -> import (replace) preserves sessions and settings', async () => {
    await store.saveSession(makeSession('a', 'A', [makeTab('https://x.com')]));
    await store.updateSettings({ autosaveInterval: 42 });

    const blob = JSON.parse(JSON.stringify(await store.exportData())); // simulate file round-trip
    await store.clearAllSessions();
    await store.updateSettings({ autosaveInterval: 10 });

    const res = await store.importData(blob, 'replace');
    expect(res.imported).toBe(1);
    expect(await store.getSession('a')).not.toBeNull();
    expect((await store.getSettings()).autosaveInterval).toBe(42);
  });
});

// ─── Core backup -> Storage restore ──────────────────────────────────────────────

describe('Core export -> Storage import', () => {
  it("ingests Core's { version, sessions } format", async () => {
    const blob = coreExport({
      c1: makeSession('c1', 'Core session', [makeTab('https://a.com')]),
      c2: makeSession('c2', 'Another', [makeTab('https://b.com')]),
    });

    const res = await store.importData(blob);
    expect(res).toEqual({ imported: 2, skipped: 0 });
    expect(Object.keys(await store.getAllSessions()).sort()).toEqual(['c1', 'c2']);
  });

  it('preserves multi-window tabs (windowIndex) that Core captures', async () => {
    const blob = coreExport({
      c1: makeSession('c1', 'Multi-window', [
        makeTab('https://a.com', 'A', { windowIndex: 0 }),
        makeTab('https://b.com', 'B', { windowIndex: 1 }),
      ]),
    });

    await store.importData(blob);
    const tabs = (await store.getSession('c1')).tabs;
    expect(tabs.map((t) => t.windowIndex)).toEqual([0, 1]);
  });
});

// ─── Storage backup -> Core restore (shape contract) ─────────────────────────────

describe('Storage export -> Core import (shape)', () => {
  it("exposes a .sessions map that Core's IMPORT_SESSIONS can read", async () => {
    await store.saveSession(makeSession('a', 'A', [makeTab('https://x.com')]));

    // Core does: JSON.parse(json).sessions ?? {}
    const json = JSON.stringify(await store.exportData());
    const parsed = JSON.parse(json);

    expect(parsed.sessions).toBeTypeOf('object');
    const ids = Object.keys(parsed.sessions);
    expect(ids).toEqual(['a']);
    // Each entry must carry the fields Core re-saves with.
    const s = parsed.sessions.a;
    expect(s).toMatchObject({ id: 'a', name: 'A', tabs: expect.any(Array) });
    expect(typeof s.createdAt).toBe('number');
  });
});
