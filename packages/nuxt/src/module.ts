import { defineNuxtModule, addPlugin, createResolver, addServerHandler, addTemplate } from '@nuxt/kit';

export interface NuxtBrowserEchoOptions {
  enabled?: boolean;
  route?: `/${string}`;
  include?: Array<'log' | 'info' | 'warn' | 'error' | 'debug'>;
  preserveConsole?: boolean;
  tag?: string;
  batch?: { size?: number; interval?: number };
  stackMode?: 'full' | 'condensed' | 'none';
  mcpEnabled?: boolean;              // default true in dev
  mcpRoute?: `/${string}`;           // default '/__mcp'
}

const module: any = defineNuxtModule<NuxtBrowserEchoOptions>({
  meta: { name: '@browser-echo/nuxt', configKey: 'browserEcho' },
  defaults: {
    enabled: true,
    route: '/__client-logs',
    include: ['log', 'info', 'warn', 'error', 'debug'],
    preserveConsole: true,
    tag: '[browser]',
    batch: { size: 20, interval: 300 },
    stackMode: 'condensed',
    mcpEnabled: true,
    mcpRoute: '/__mcp'
  },
  setup(options, nuxt) {
    if (!nuxt.options.dev || options.enabled === false) return;
    const r = createResolver(import.meta.url);

    addServerHandler({
      route: options.mcpRoute!,
      handler: r.resolve('./runtime/server/mcp')
    });

    const serverInitTpl = addTemplate({
      filename: 'browser-echo.mcp.server.mjs',
      getContents: () => `
import { startMcpServer } from '@browser-echo/mcp';
export default () => {
  if (process.dev) {
    process.env.BROWSER_ECHO_MCP = ${JSON.stringify(options.mcpEnabled !== false ? '1' : '0')};
    try { startMcpServer(); } catch (e) { console.error('[browser-echo] MCP server failed to start:', e); }
  }
};
`
    });
    addPlugin({ src: serverInitTpl.dst, mode: 'server' });

    addServerHandler({
      route: options.route!,
      handler: r.resolve('./runtime/server/handler')
    });

    const tpl = addTemplate({
      filename: 'browser-echo.client.mjs',
      getContents: () => `
import { initBrowserEcho } from '@browser-echo/core';
export default defineNuxtPlugin(() => {
  if (process.dev && typeof window !== 'undefined') {
    initBrowserEcho(${JSON.stringify({
      route: options.route,
      include: options.include,
      preserveConsole: options.preserveConsole,
      tag: options.tag,
      batch: options.batch,
      stackMode: options.stackMode
    })});
  }
});
`
    });
    addPlugin({ src: tpl.dst, mode: 'client' });
  }
});

export default module;
