#!/usr/bin/env node

import { defineCommand, runMain as _runMain } from 'citty';
import { version } from '../package.json';

import { createServer, startServer, stopServer, startHttpServer } from './server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LogStore, normalizeLevel, type LogEntry } from './store';
import { registerTools } from './tools';
import { registerResources } from './resources';
import { getPackageJson } from './utils';

const cli = defineCommand({
  meta: {
    name: 'browser-echo-mcp',
    version,
    description: 'MCP server for Browser Echo (stdio by default, Streamable HTTP via --http)'
  },
  args: {
    // Shared/ingest args (used for both transports)
    port: { type: 'string', description: 'HTTP port for ingest or full HTTP transport (default 5179)', default: '5179' },
    host: { type: 'string', description: 'HTTP host for ingest or full HTTP transport (default 127.0.0.1)', default: '127.0.0.1' },
    logsRoute: { type: 'string', description: 'Logs ingest route (default /__client-logs)', default: '/__client-logs' },

    // Full HTTP transport only
    endpoint: { type: 'string', description: 'MCP endpoint path when using --http (default /mcp)', default: '/mcp' },

    // Buffer
    buffer: { type: 'string', description: 'Max in-memory entries (default 1000)' },

    // Transport selector
    http: { type: 'boolean', description: 'Use full Streamable HTTP transport (default: stdio)', default: false }
  },
  async run({ args }) {
    const mcp = createServer({ name: 'Browser Echo (Frontend Logs)', version });

    process.on('SIGTERM', () => stopServer(mcp));
    process.on('SIGINT', () => stopServer(mcp));

    if (args.buffer) {
      process.env.BROWSER_ECHO_BUFFER_SIZE = String(args.buffer);
    }

    // Determine transport: stdio by default, or HTTP if --http or network options provided
    const useHttp = args.http 
      || args.port !== '5179' || args.host !== '127.0.0.1' 
      || args.endpoint !== '/mcp' || args.logsRoute !== '/__client-logs';

    // Start server with selected transport. Prefer 5179 for ingest if stdio.
    await startServer(mcp, useHttp ? {
      type: 'http',
      host: String(args.host),
      port: Number(args.port) | 0,
      endpoint: String(args.endpoint) as `/${string}`,
      logsRoute: String(args.logsRoute) as `/${string}`
    } : {
      type: 'stdio',
      host: String(args.host),
      port: Number(args.port) | 0,
      logsRoute: String(args.logsRoute) as `/${string}`
    });
  }
});

export const runMain = () => _runMain(cli);

// ---------- Programmatic helpers (advanced) ----------

let activeStore: LogStore | null = null;

/**
 * Start the Streamable HTTP MCP server in-process (advanced).
 * If BROWSER_ECHO_MCP_URL is set, this will no-op to avoid duplicate servers.
 */
export async function startMcpServer(options: {
  name?: string;
  version?: string;
  bufferSize?: number;
  port?: number;
  host?: string;
  endpoint?: `/${string}`;
  logsRoute?: `/${string}`;
} = {}): Promise<void> {
  if (process.env.BROWSER_ECHO_MCP_URL) {
    // eslint-disable-next-line no-console
    console.log('[browser-echo] External MCP server detected at', process.env.BROWSER_ECHO_MCP_URL);
    return;
  }
  const pkg = getPackageJson();
  const name = options.name || pkg?.name || 'Browser Echo Logs';
  const ver = options.version || pkg?.version || '0.0.0';
  const mcp = new McpServer({ name, version: ver });

  // Initialize log store with specified or default buffer size
  const bufferMax = options.bufferSize ?? Number(process.env.BROWSER_ECHO_BUFFER_SIZE ?? 1000) | 0;
  const store = new LogStore(bufferMax > 0 ? bufferMax : 1000);
  activeStore = store;  // keep reference for publishLogEntry
  const context = { mcp, store };
  registerTools(context);
  registerResources(context);

  // Start Streamable HTTP transport on specified or default host/port
  const host = options.host || '127.0.0.1';
  const port = options.port || 5179;
  const endpoint = options.endpoint || '/mcp';
  const logsRoute = options.logsRoute || '/__client-logs';
  await startHttpServer(mcp, store, { host, port, endpoint, logsRoute });
}

/** Append a log entry to the active in-process store (only when using startMcpServer) */
export function publishLogEntry(entry: {
  sessionId?: string;
  level: string;
  text: string;
  time?: number;
  source?: string;
  stack?: string;
  tag?: string;
}): void {
  if (!entry.text || !entry.level) {
    console.error('[browser-echo] Missing required fields for publishLogEntry');
    return;
  }
  const level = normalizeLevel(entry.level);
  const logEntry: LogEntry = {
    sessionId: entry.sessionId?.trim() || 'manual',
    level,
    text: entry.text,
    time: entry.time ?? Date.now(),
    source: entry.source,
    stack: entry.stack,
    tag: entry.tag || '[browser]'
  };
  if (!activeStore) {
    console.error('[browser-echo] No active MCP server to publish log entry');
  } else {
    activeStore.append(logEntry);
  }
}