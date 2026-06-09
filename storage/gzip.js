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

/** Decompresses gzip bytes back into a string. */
export async function gunzipToString(bytes) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
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
