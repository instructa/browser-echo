#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_CONTENT = `export { POST, runtime, dynamic } from '@browser-echo/next/route';
`;
const MCP_ROUTE_CONTENT = `export { GET, POST, DELETE, runtime, dynamic } from '@browser-echo/next/mcp-route';
`;

export function setup(projectRoot = process.cwd()) {
  // Check if we're in a Next.js project
  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error('❌ No package.json found. Are you in a Next.js project?');
    process.exit(1);
  }

  // Check for app directory
  const appDir = join(projectRoot, 'app');
  if (!existsSync(appDir)) {
    console.error('❌ No app directory found. This setup is for Next.js App Router.');
    process.exit(1);
  }

  // Create the API route
  const apiDir = join(appDir, 'api');
  const clientLogsDir = join(apiDir, 'client-logs');
  const routePath = join(clientLogsDir, 'route.ts');

  // Create directories if they don't exist
  if (!existsSync(apiDir)) {
    mkdirSync(apiDir, { recursive: true });
  }
  if (!existsSync(clientLogsDir)) {
    mkdirSync(clientLogsDir, { recursive: true });
  }

  // Write the client-logs route file
  writeFileSync(routePath, ROUTE_CONTENT);
  console.log('✅ Created route at app/api/client-logs/route.ts');

  const mcpDir = join(apiDir, 'mcp');
  const mcpRoutePath = join(mcpDir, 'route.ts');
  if (!existsSync(mcpDir)) mkdirSync(mcpDir, { recursive: true });
  writeFileSync(mcpRoutePath, MCP_ROUTE_CONTENT);
  console.log('✅ Created route at app/api/mcp/route.ts');

  // Instructions (extended)
  console.log(`
📝 Next steps:

1. Add BrowserEchoScript to your root layout:

   import BrowserEchoScript from '@browser-echo/next/BrowserEchoScript';

   // In your layout's <head>:
   {process.env.NODE_ENV === 'development' && (
     <BrowserEchoScript route="/api/client-logs" />
   )}

2. Restart your dev server

3. Browser logs will now appear via MCP at /api/mcp (non-polluting). To fall back to terminal printing, set BROWSER_ECHO_MCP=0.

`);
}

// Run if called directly (ESM-safe)
const isDirectRun = typeof process !== 'undefined'
  && Array.isArray(process.argv)
  && (process.argv[1]?.endsWith('setup.mjs') || process.argv[1]?.endsWith('setup.js'));

if (isDirectRun) {
  setup();
}
