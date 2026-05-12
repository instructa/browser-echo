import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type BrowserEchoMcpTarget = {
  url: string;
  routeLogs: `/${string}`;
};

export const BROWSER_ECHO_FORWARD_TIMEOUT_MS = 300;

const LOCAL_MCP_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function hasExplicitMcpUrl(value = process.env.BROWSER_ECHO_MCP_URL): boolean {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(normalized && !['undefined', 'null', 'false', '0'].includes(normalized));
}

export function resolveBrowserEchoMcpTarget(cwd = process.cwd()): BrowserEchoMcpTarget | null {
  try {
    let dir = cwd;
    for (let depth = 0; depth < 10; depth++) {
      const discoveryPath = join(dir, '.browser-echo-mcp.json');
      if (existsSync(discoveryPath)) {
        const data = JSON.parse(readFileSync(discoveryPath, 'utf-8'));
        const url = normalizeLocalMcpUrl(data?.url);
        if (!url) break;

        return {
          url,
          routeLogs: normalizeMcpRoute(data?.route ?? data?.routeLogs),
        };
      }

      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    return null;
  }

  return null;
}

export async function forwardBrowserEchoPayload(
  payload: unknown,
  options: {
    cwd?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const target = resolveBrowserEchoMcpTarget(options.cwd);
  if (!target) return false;

  return forwardToBrowserEchoMcp(target, payload, options);
}

export async function forwardToBrowserEchoMcp(
  target: BrowserEchoMcpTarget,
  payload: unknown,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return false;

  const timeoutMs = options.timeoutMs ?? BROWSER_ECHO_FORWARD_TIMEOUT_MS;
  const url = `${target.url}${target.routeLogs}`;
  const requestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store' as RequestCache,
  };
  const timeout = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(url, { ...requestInit, signal: timeout.signal });
    return Boolean(response?.ok);
  } catch (error) {
    if (isAbortSignalCompatibilityError(error)) {
      return forwardWithTimeoutOnly(fetchImpl, url, requestInit, timeoutMs);
    }
    return false;
  } finally {
    timeout.clear();
  }
}

function normalizeLocalMcpUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:') return '';
    if (!LOCAL_MCP_HOSTS.has(parsed.hostname)) return '';

    const path = parsed.pathname.replace(/\/+$/g, '');
    if (path && path !== '/mcp') return '';

    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/g, '');
  } catch {
    return '';
  }
}

function normalizeMcpRoute(value: unknown): `/${string}` {
  if (typeof value !== 'string') return '/__client-logs';
  const route = value.trim();
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('://')) return '/__client-logs';
  return route as `/${string}`;
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function isAbortSignalCompatibilityError(error: unknown): boolean {
  return error instanceof TypeError && String(error.message).includes('AbortSignal');
}

async function forwardWithTimeoutOnly(
  fetchImpl: typeof fetch,
  url: string,
  requestInit: RequestInit,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = fetchImpl(url, requestInit)
      .then((response) => Boolean(response?.ok))
      .catch(() => false);
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });

    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
