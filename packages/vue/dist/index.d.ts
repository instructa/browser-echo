import { Plugin } from 'vue';
import { InitBrowserEchoOptions } from '@browser-echo/core';

declare function createBrowserEchoVuePlugin(options?: InitBrowserEchoOptions): Plugin;

export { createBrowserEchoVuePlugin };
