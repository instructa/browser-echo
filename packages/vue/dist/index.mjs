import { initBrowserEcho } from '@browser-echo/core';

function createBrowserEchoVuePlugin(options = {}) {
  return { install(_app) {
    if (import.meta.env?.DEV && typeof window !== "undefined")
      initBrowserEcho(options);
  } };
}

export { createBrowserEchoVuePlugin };
