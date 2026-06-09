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

/** A File-like object backed by raw bytes (supports .arrayBuffer()). */
function fileFromBytes(bytes) {
  return {
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function fileFromText(text) {
  return fileFromBytes(new TextEncoder().encode(text));
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

// ─── Gzip compression ────────────────────────────────────────────────────────────

describe('gzip helpers', () => {
  it('round-trips a string through gzip/gunzip', async () => {
    const text = JSON.stringify({ hello: 'world', n: [1, 2, 3] });
    const bytes = await ft.gzipString(text);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0x1f); // gzip magic bytes
    expect(bytes[1]).toBe(0x8b);
    expect(await ft.gunzipToString(bytes)).toBe(text);
  });

  it('actually shrinks repetitive data', async () => {
    const text = 'a'.repeat(5000);
    const bytes = await ft.gzipString(text);
    expect(bytes.length).toBeLessThan(text.length);
  });
});

describe('readBackupFile (auto-detect)', () => {
  it('reads a plain JSON backup', async () => {
    const parsed = await ft.readBackupFile(fileFromText('{"sessions":{}}'));
    expect(parsed).toEqual({ sessions: {} });
  });

  it('reads a gzipped backup', async () => {
    const gz = await ft.gzipString('{"sessions":{}}');
    const parsed = await ft.readBackupFile(fileFromBytes(gz));
    expect(parsed).toEqual({ sessions: {} });
  });

  it('throws on invalid JSON', async () => {
    await expect(ft.readBackupFile(fileFromText('nope'))).rejects.toThrow(/not valid JSON/);
  });
});

describe('importBackupFile', () => {
  it('imports from a gzipped backup', async () => {
    const blob = { sessions: { a: makeSession('a', 'A') } };
    const gz = await ft.gzipString(JSON.stringify(blob));
    const res = await ft.importBackupFile(fileFromBytes(gz));
    expect(res).toEqual({ imported: 1, skipped: 0 });
    expect(await store.getSession('a')).not.toBeNull();
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
