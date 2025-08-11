import { BrowserLogLevel } from '@browser-echo/core';

interface BrowserLogsToTerminalOptions {
    enabled?: boolean;
    route?: `/${string}`;
    include?: BrowserLogLevel[];
    preserveConsole?: boolean;
    tag?: string;
    showSource?: boolean;
    colors?: boolean;
    injectHtml?: boolean;
    stackMode?: 'none' | 'condensed' | 'full';
    batch?: {
        size?: number;
        interval?: number;
    };
    truncate?: number;
    fileLog?: {
        enabled?: boolean;
        dir?: string;
    };
}
declare function browserEcho(opts?: BrowserLogsToTerminalOptions): any;

export { browserEcho as default };
export type { BrowserLogsToTerminalOptions };
