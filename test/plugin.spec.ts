import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Plugin, ViteDevServer } from 'vite';
import { Readable } from 'node:stream';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';

import browserLogsToTerminal from '../src/stream-logs-to-terminal';

type Logger = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

function createMockServer(): {
  server: ViteDevServer;
  attach: (plugin: Plugin) => void;
  handlers: Record<string, any>;
} {
  const handlers: Record<string, any> = {};
  const logger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const server = {
    config: { logger },
    middlewares: {
      use(route: any, handler: any) {
        if (typeof route === 'string') handlers[route] = handler;
        else handlers['/'] = route;
      },
    },
  } as unknown as ViteDevServer;

  return {
    server,
    attach: (plugin) => {
      const hook = (plugin as any).configureServer;
      if (!hook) return;
      if (typeof hook === 'function') {
        hook(server);
      } else if (hook && typeof hook === 'object' && 'handler' in hook) {
        try {
          (hook as any).handler(server);
        } catch {}
      }
    },
    handlers,
  };
}

function makeReq(method: string, url: string, body: any) {
  const stream = new Readable({ read() {} }) as unknown as NodeJS.ReadableStream & {
    method?: string;
    url?: string;
  };
  (stream as any).method = method;
  (stream as any).url = url;
  // emit after next tick
  process.nextTick(() => {
    (stream as any).emit('data', Buffer.from(JSON.stringify(body)));
    (stream as any).emit('end');
  });
  return stream;
}

function makeRes(): { res: any; done: Promise<void>; statusCode?: number } {
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const res: any = {
    statusCode: 0,
    end() {
      resolve();
    },
  };
  return { res, done };
}

describe('vite-browser-logs plugin - basics', () => {
  it('resolves and loads virtual module', async () => {
    const plugin = browserLogsToTerminal() as Plugin;

    const id = (plugin.resolveId as any)('virtual:browser-logs-to-terminal');
    expect(id).toBe('\0virtual:browser-logs-to-terminal');

    const code = (plugin.load as any)('\0virtual:browser-logs-to-terminal');
    expect(typeof code).toBe('string');
    expect(String(code)).toContain('navigator.sendBeacon');
  });

  it('injects script tag when injectHtml is true', async () => {
    const plugin = browserLogsToTerminal({ injectHtml: true }) as Plugin;
    const result = (plugin.transformIndexHtml as any)('<html></html>', {});
    expect(result).toBeTruthy();
    expect(result.tags?.[0]?.attrs?.src).toContain('/@id/virtual:browser-logs-to-terminal');
  });
});

describe('vite-browser-logs plugin - middleware logging', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(joinPath(tmpdir(), 'vbl-'));
  });
  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('forwards logs to logger with condensed stack and no colors', async () => {
    const plugin = browserLogsToTerminal({ colors: false, stackMode: 'condensed' }) as Plugin;
    const { server, attach, handlers } = createMockServer();
    attach(plugin);

    const payload = {
      sessionId: 'abcdef12',
      entries: [
        {
          level: 'info',
          text: 'hello world',
          stack: 'Error\n at file.js:1:1',
          source: 'src/file.ts:1:1',
        },
        { level: 'warn', text: 'be careful', stack: 'Stack\n at file.ts:2:2' },
        { level: 'error', text: 'boom' },
      ],
    };

    const req = makeReq('POST', '/__client-logs', payload);
    const { res, done } = makeRes();
    const handler = handlers['/__client-logs'];
    handler(req, res, () => {});
    await done;

    const logger = (server.config as any).logger as Logger;
    expect(logger.info).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();

    const firstInfo = String(logger.info.mock.calls[0]?.[0] ?? '');
    expect(firstInfo).toContain('[browser] [abcdef12] INFO: hello world');
    // condensed stack prints a single indented line
    const hasCondensed = logger.info.mock.calls.some((c) =>
      String(c[0]).includes('    at file.js:1:1')
    );
    expect(hasCondensed).toBe(true);
  });

  it('file logging writes to disk', async () => {
    const plugin = browserLogsToTerminal({
      colors: false,
      stackMode: 'none',
      fileLog: { enabled: true, dir: tmpDir },
    }) as Plugin;

    const { attach, handlers } = createMockServer();
    attach(plugin);

    const payload = {
      sessionId: 'xyz98765',
      entries: [{ level: 'error', text: 'disk-write-check' }],
    };

    const req = makeReq('POST', '/__client-logs', payload);
    const { res, done } = makeRes();
    const handler = handlers['/__client-logs'];
    handler(req, res, () => {});
    await done;

    const files = readdirSync(tmpDir).filter((f) => f.endsWith('.log'));
    expect(files.length).toBe(1);
    const content = readFileSync(joinPath(tmpDir, files[0]!), 'utf-8');
    expect(content).toContain('disk-write-check');
  });
});
