#!/usr/bin/env node

import { defineCommand, runMain as _runMain } from 'citty';
import { version } from '../package.json';

import { createServer, startServer, stopServer } from './server';

const cli = defineCommand({
  meta: {
    name: 'browser-echo-mcp',
    version,
    description: 'MCP server for Browser Echo using Streamable HTTP transport'
  },
  args: {
    port: { type: 'string', description: 'HTTP port (default 5179)', default: '5179' },
    host: { type: 'string', description: 'HTTP host (default 127.0.0.1)', default: '127.0.0.1' },
    endpoint: { type: 'string', description: 'MCP endpoint path (default /mcp)', default: '/mcp' },
    logsRoute: { type: 'string', description: 'Logs ingest route (default /__client-logs)', default: '/__client-logs' },
    buffer: { type: 'string', description: 'Max in-memory entries (default 1000)' }
  },
  async run({ args }) {
    const mcp = createServer({ name: 'Browser Echo (Frontend Logs)', version });

    process.on('SIGTERM', () => stopServer(mcp));
    process.on('SIGINT', () => stopServer(mcp));

    await startServer(mcp, {
      type: 'http',
      host: String(args.host || '127.0.0.1'),
      port: Number(args.port || '5179') | 0,
      endpoint: String(args.endpoint || '/mcp') as `/${string}`,
      logsRoute: String(args.logsRoute || '/__client-logs') as `/${string}`
    });
  }
});

export const runMain = () => _runMain(cli);