/**
 * File transfer helpers for the Storage layer.
 *
 * Wraps the browser File/Blob APIs around storage.js's exportData/importData
 * so the UI can offer "Download backup" / "Restore from file" with a single
 * call. Pure storage concern — knows nothing about the popup's layout.
 *
 * NOTE: the download/picker helpers use the DOM (document, URL.createObjectURL)
 * and therefore must run in a document context (the popup), not in the
 * service worker. The data-shaping helpers below are environment-agnostic.
 */

import { exportData, importData } from './storage.js';
import { gzipString, gunzipToString } from './gzip.js';

// Re-export so existing callers can keep importing gzip from file-transfer.
export { gzipString, gunzipToString } from './gzip.js';

// ─── Pure helpers (safe anywhere, easy to test) ─────────────────────────────────

/** Builds a dated backup filename, e.g. "session-vault-backup-2026-06-09.json". */
export function backupFilename(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `session-vault-backup-${stamp}.json`;
}

/** Pretty-prints a data blob for a human-readable backup file. */
export function toJSONString(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Parses a File/Blob's text content as JSON.
 * Uses the modern Blob.text() API (no FileReader needed).
 * Throws a clear error if the contents aren't valid JSON.
 */
export async function readJSONFile(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
}

// ─── DOM-backed helpers (popup context only) ─────────────────────────────────────

/** Triggers a browser download of a Blob. Popup context only. */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Triggers a browser download of `data` as a JSON file.
 * Must run where `document` exists (the popup), not the service worker.
 */
export function downloadJSON(data, filename = backupFilename()) {
  triggerDownload(new Blob([toJSONString(data)], { type: 'application/json' }), filename);
}

/** Exports everything and downloads it as a dated backup file. */
export async function downloadBackup() {
  const data = await exportData();
  downloadJSON(data, backupFilename());
}

/**
 * Exports everything and downloads it as a gzip-compressed backup
 * (`.json.gz`). Far smaller for large session histories — keeps big
 * backups well under the storage quota and faster to move around.
 */
export async function downloadBackupCompressed() {
  const data = await exportData();
  const bytes = await gzipString(toJSONString(data));
  const filename = backupFilename().replace(/\.json$/, '.json.gz');
  triggerDownload(new Blob([bytes], { type: 'application/gzip' }), filename);
}

/**
 * Opens an OS file picker and resolves with the chosen File.
 * Optional convenience — the UI may use its own <input> instead.
 */
export function pickJSONFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,application/gzip,.json,.gz';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new Error('No file selected'));
    });
    input.click();
  });
}

/**
 * Reads a backup file and parses it, auto-detecting gzip vs plain JSON
 * via the gzip magic bytes (0x1f 0x8b). Use this for imports so a user
 * can drop in either a `.json` or a `.json.gz` backup.
 */
export async function readBackupFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip ? await gunzipToString(bytes) : new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
}

/**
 * Reads a chosen JSON file and imports it into storage.
 * mode: 'merge' (default) | 'replace'.
 * Returns { imported, skipped }.
 */
export async function importFromFile(file, mode = 'merge') {
  const blob = await readJSONFile(file);
  return importData(blob, mode);
}

/**
 * Reads a backup file (plain or gzipped) and imports it into storage.
 * Auto-detects the format. mode: 'merge' (default) | 'replace'.
 * Returns { imported, skipped }.
 */
export async function importBackupFile(file, mode = 'merge') {
  const blob = await readBackupFile(file);
  return importData(blob, mode);
}
