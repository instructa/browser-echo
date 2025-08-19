import { defineNuxtModule, addPlugin, createResolver, addServerHandler, addTemplate } from '@nuxt/kit';

export interface NuxtBrowserEchoOptions {
  enabled?: boolean;
  route?: `/${string}`;
  include?: Array<'log' | 'info' | 'warn' | 'error' | 'debug'>;
  preserveConsole?: boolean;
  tag?: string;
  batch?: { size?: number; interval?: number };
  stackMode?: 'full' | 'condensed' | 'none';
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
    stackMode: 'condensed'
  },
  setup(options, nuxt) {
    if (!nuxt.options.dev || options.enabled === false) return;
    const r = createResolver(import.meta.url);

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
