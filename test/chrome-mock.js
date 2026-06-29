/**
 * In-memory stand-in for the chrome.storage.local API used by the
 * Storage layer. Lets us unit-test storage.js without a real browser.
 *
 * Usage in a test file:
 *
 *   import { installChromeMock } from '../test/chrome-mock.js';
 *   let mock;
 *   beforeEach(() => { mock = installChromeMock(); });
 */

export function createChromeMock() {
  let store = {};

  const local = {
    // Default Chrome value (10 MB). Storage code reads this for quota.
    QUOTA_BYTES: 10_485_760,

    async get(keys) {
      if (keys == null) return { ...store };

      if (typeof keys === 'string') {
        return { [keys]: store[keys] };
      }

      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) out[k] = store[k];
        return out;
      }

      // Object form: keys are defaults.
      const out = {};
      for (const [k, def] of Object.entries(keys)) {
        out[k] = k in store ? store[k] : def;
      }
      return out;
    },

    async set(obj) {
      store = { ...store, ...structuredClone(obj) };
    },

    async remove(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete store[k];
    },

    async clear() {
      store = {};
    },

    async getBytesInUse(keys) {
      const data =
        keys == null
          ? store
          : (Array.isArray(keys) ? keys : [keys]).reduce((acc, k) => {
              acc[k] = store[k];
              return acc;
            }, {});
      return new TextEncoder().encode(JSON.stringify(data)).length;
    },

    // Test helpers (not part of the real API).
    _reset() {
      store = {};
    },
    _dump() {
      return structuredClone(store);
    },
  };

  // Minimal chrome.runtime. The manifest carries NO `update_url`, so
  // entitlements.isDevBuild() treats the test environment as an unpacked/dev
  // build (which it effectively is) — matching how the extension runs locally.
  const runtime = {
    id: 'session-vault-test',
    getManifest: () => ({ manifest_version: 3, name: 'Session Vault', version: '0.1.0' }),
    getURL: (path = '') => `chrome-extension://session-vault-test/${path}`,
  };

  return { storage: { local }, runtime };
}

/** Installs a fresh mock on globalThis.chrome and returns it. */
export function installChromeMock() {
  const mock = createChromeMock();
  globalThis.chrome = mock;
  return mock;
}
