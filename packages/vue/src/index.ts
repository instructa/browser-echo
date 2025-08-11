import type { App, Plugin as VuePlugin } from 'vue';
import { initBrowserEcho } from '@browser-echo/core';
import type { InitBrowserEchoOptions } from '@browser-echo/core';

export function createBrowserEchoVuePlugin(options: InitBrowserEchoOptions = {}): VuePlugin {
  return { install(_app: App) { if (import.meta.env?.DEV && typeof window !== 'undefined') initBrowserEcho(options); } };
}
