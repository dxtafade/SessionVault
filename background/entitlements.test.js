import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from '../test/chrome-mock.js';

beforeEach(() => installChromeMock());

// Imported after the mock is installed each test via dynamic import to get a
// clean module against the fresh chrome stub.
async function load() {
  return import('./entitlements.js');
}

describe('entitlements', () => {
  it('defaults to free (pro: false)', async () => {
    const { getEntitlements, isPro } = await load();
    expect(await getEntitlements()).toEqual({ pro: false });
    expect(await isPro()).toBe(false);
  });

  it('setPro(true) persists and isPro() reflects it', async () => {
    const { setPro, isPro, getEntitlements } = await load();
    const next = await setPro(true);
    expect(next.pro).toBe(true);
    expect(await isPro()).toBe(true);
    expect(await getEntitlements()).toEqual({ pro: true });
  });

  it('setPro coerces truthy/falsy to a strict boolean', async () => {
    const { setPro, isPro } = await load();
    await setPro('yes'); // not === true
    expect(await isPro()).toBe(false);
    await setPro(true);
    expect(await isPro()).toBe(true);
    await setPro(false);
    expect(await isPro()).toBe(false);
  });

  it('exposes the free session limit as 50', async () => {
    const { FREE_SESSION_LIMIT } = await load();
    expect(FREE_SESSION_LIMIT).toBe(50);
  });
});
