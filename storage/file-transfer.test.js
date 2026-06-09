import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';
import * as ft from './file-transfer.js';
import * as store from './storage.js';

function makeSession(id, name) {
  const now = Date.now();
  return { id, name, createdAt: now, updatedAt: now, tabs: [], isAuto: false };
}

/** A minimal stand-in for a File: only needs .text(). */
function fakeFile(contents) {
  return { text: async () => contents };
}

beforeEach(() => {
  installChromeMock();
});

// ─── Pure helpers ───────────────────────────────────────────────────────────────

describe('backupFilename', () => {
  it('formats a dated, padded filename', () => {
    const name = ft.backupFilename(new Date(2026, 5, 9)); // June = month index 5
    expect(name).toBe('session-vault-backup-2026-06-09.json');
  });
});

describe('toJSONString', () => {
  it('pretty-prints with 2-space indent', () => {
    expect(ft.toJSONString({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

// ─── readJSONFile ────────────────────────────────────────────────────────────────

describe('readJSONFile', () => {
  it('parses valid JSON from a file', async () => {
    const parsed = await ft.readJSONFile(fakeFile('{"sessions":{}}'));
    expect(parsed).toEqual({ sessions: {} });
  });

  it('throws a clear error on invalid JSON', async () => {
    await expect(ft.readJSONFile(fakeFile('not json'))).rejects.toThrow(/not valid JSON/);
  });
});

// ─── importFromFile (integration with storage) ──────────────────────────────────

describe('importFromFile', () => {
  it('reads a file and imports its sessions', async () => {
    const blob = { sessions: { a: makeSession('a', 'A') } };
    const res = await ft.importFromFile(fakeFile(JSON.stringify(blob)));
    expect(res).toEqual({ imported: 1, skipped: 0 });
    expect(await store.getSession('a')).not.toBeNull();
  });

  it('honours replace mode', async () => {
    await store.saveSession(makeSession('old', 'Old'));
    const blob = { sessions: { fresh: makeSession('fresh', 'Fresh') } };
    await ft.importFromFile(fakeFile(JSON.stringify(blob)), 'replace');
    expect(Object.keys(await store.getAllSessions())).toEqual(['fresh']);
  });
});

// ─── downloadJSON (DOM stubbed) ──────────────────────────────────────────────────

describe('downloadJSON', () => {
  it('builds a blob URL and triggers an anchor download', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = { click, remove, set href(v) { this._href = v; }, get href() { return this._href; } };

    globalThis.document = {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    };
    globalThis.URL = {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    };

    ft.downloadJSON({ hello: 'world' }, 'out.json');

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.download).toBe('out.json');
    expect(anchor.href).toBe('blob:fake');
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });
});
