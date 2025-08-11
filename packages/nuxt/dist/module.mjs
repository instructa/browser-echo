import { defineNuxtModule, createResolver, addServerHandler, addTemplate, addPlugin } from '@nuxt/kit';

defineNuxtModule({
  meta: { name: "@browser-echo/nuxt", configKey: "browserEcho" },
  defaults: {
    enabled: true,
    route: "/__client-logs",
    include: ["log", "info", "warn", "error", "debug"],
    preserveConsole: true,
    tag: "[browser]",
    batch: { size: 20, interval: 300 }
  },
  setup(options, nuxt) {
    if (!nuxt.options.dev || options.enabled === false)
      return;
    const r = createResolver(import.meta.url);
    addServerHandler({
      route: options.route,
      handler: r.resolve("./runtime/server/handler")
    });
    const tpl = addTemplate({
      filename: "browser-echo.client.mjs",
      getContents: () => `
import { initBrowserEcho } from '@browser-echo/core';
export default defineNuxtPlugin(() => {
  if (process.dev && typeof window !== 'undefined') {
    initBrowserEcho(${JSON.stringify({
        route: options.route,
        include: options.include,
        preserveConsole: options.preserveConsole,
        tag: options.tag,
        batch: options.batch
      })});
  }
});

export default module;
`
    });
    addPlugin({ src: tpl.dst, mode: "client" });
  }
});
