/**
 * Gzip + base64 helpers.
 *
 * Standalone so both the Storage layer (archive compression) and the
 * file-transfer module (backup files) can share one implementation without
 * a circular import. Uses native CompressionStream — available in MV3
 * service workers, the popup, and Node 18+.
 */

/** Gzip-compresses a string, returns the bytes. */
export async function gzipString(text) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Hard cap on decompressed output. A gzip stream can expand by ~1000x, so a
 * few-KB malicious backup file could otherwise inflate to gigabytes and exhaust
 * memory. 64 MB is far beyond any legitimate vault export.
 */
export const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

/**
 * Decompresses gzip bytes back into a string. Streams the output and aborts as
 * soon as it exceeds MAX_DECOMPRESSED_BYTES, so a decompression bomb cannot
 * blow up memory before we'd otherwise buffer the whole thing.
 */
export async function gunzipToString(bytes, maxBytes = MAX_DECOMPRESSED_BYTES) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Decompressed data exceeds the maximum allowed size');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

// ─── base64 (chunk-safe; works in SW / popup / Node) ─────────────────────────────

export function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Compresses a string and returns a chrome.storage-safe base64 string. */
export async function compressToBase64(text) {
  return bytesToBase64(await gzipString(text));
}

/** Reverses compressToBase64. */
export async function decompressFromBase64(b64) {
  return gunzipToString(base64ToBytes(b64));
}
