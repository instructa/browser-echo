import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initBrowserEcho } from '../src/client';
import * as coreIndex from '../src/index';

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

  it('uses sendBeacon when available', async () => {
    const originalSendBeacon = (navigator as any).sendBeacon;
    const sendBeaconSpy = vi.fn().mockReturnValue(true);
    (navigator as any).sendBeacon = sendBeaconSpy;

    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({} as any);

    initBrowserEcho({ route: '/__client-logs', include: ['log'], preserveConsole: true });
    console.log('hello beacon');
    await new Promise(r => setTimeout(r, 350));

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    (navigator as any).sendBeacon = originalSendBeacon;
  });

  it('flushes immediately when batch size threshold is reached', async () => {
    const originalSendBeacon = (navigator as any).sendBeacon;
    try { delete (navigator as any).sendBeacon; } catch {}

    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({} as any);

    initBrowserEcho({ route: '/__client-logs', include: ['log'], batch: { size: 2, interval: 1000 } });

    console.log('a');
    console.log('b'); // reaching batch size triggers flush

    await new Promise(r => setTimeout(r, 50));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
    if (originalSendBeacon !== undefined) {
      (navigator as any).sendBeacon = originalSendBeacon;
    }
  });

  it('does not call original console when preserveConsole is false', async () => {
    const originalSendBeacon = (navigator as any).sendBeacon;
    try { delete (navigator as any).sendBeacon; } catch {}
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({} as any);

    // Install a stub as the original console.log to detect invocations
    const originalConsoleLog = console.log;
    let originalCalled = 0;
    // @ts-ignore
    console.log = function stub() { originalCalled++; } as any;

    initBrowserEcho({ route: '/__client-logs', include: ['log'], preserveConsole: false });
    console.log('should not call original');

    await new Promise(r => setTimeout(r, 50));
    expect(originalCalled).toBe(0);

    // Cleanup
    console.log = originalConsoleLog;
    fetchSpy.mockRestore();
    if (originalSendBeacon !== undefined) {
      (navigator as any).sendBeacon = originalSendBeacon;
    }
  });

  it('public API exports stay unchanged', () => {
    const keys = Object.keys(coreIndex as any).sort();
    expect(keys).toEqual(['initBrowserEcho']);
    expect(typeof (coreIndex as any).initBrowserEcho).toBe('function');
  });
});
