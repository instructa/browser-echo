import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initBrowserEcho } from '../src/client';

describe('@browser-echo/core', () => {
  beforeEach(() => {
    // reset install flag
    // @ts-ignore
    delete (window as any).__browser_echo_installed__;
  });

  it('patches console and posts logs', async () => {
    // Force fetch path by disabling sendBeacon for this test
    const originalSendBeacon = (navigator as any).sendBeacon;
    try { delete (navigator as any).sendBeacon; } catch {}

    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({} as any);
    const logSpy = vi.spyOn(console, 'log');

    initBrowserEcho({ route: '/__client-logs', preserveConsole: true });

    console.log('hello', { a: 1 });
    // wait a tick for batching timer
    await new Promise(r => setTimeout(r, 350));

    expect(logSpy).toHaveBeenCalled(); // preserved
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const body = (fetchSpy.mock.calls[0][1] as any).body;
    const payload = JSON.parse(body);
    expect(payload.entries[0].text).toContain('hello');

    fetchSpy.mockRestore();
    logSpy.mockRestore();
    // Restore sendBeacon after test
    if (originalSendBeacon !== undefined) {
      (navigator as any).sendBeacon = originalSendBeacon;
    }
  });
});
