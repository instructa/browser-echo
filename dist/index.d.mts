import { Plugin } from 'vite';

type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
interface BrowserLogsToTerminalOptions {
    /**
     * Enable/disable plugin (dev only). Defaults to true.
     */
    enabled?: boolean;
    /**
     * HTTP endpoint the client will POST logs to.
     * Same-origin route served by the Vite dev server.
     * @default "/__client-logs"
     */
    route?: `/${string}`;
    /**
     * Which console levels to forward.
     * @default ['log','info','warn','error','debug']
     */
    include?: BrowserLogLevel[];
    /**
     * Keep logging in the browser console as well as forwarding to terminal.
     * @default true
     */
    preserveConsole?: boolean;
    /**
     * Prefix printed in the terminal before each message.
     * @default "[browser]"
     */
    tag?: string;
    /**
     * Print (pretty indented) stack traces when available.
     * @default true
     * @deprecated Use `stackMode` instead ('none' | 'condensed' | 'full').
     */
    showStack?: boolean;
    /**
     * How to print stack traces: 'none' | 'condensed' | 'full'.
     * If provided, overrides showStack.
     * @default 'full'
     */
    stackMode?: 'none' | 'condensed' | 'full';
    /**
     * Print the first source location extracted from the stack (file:line:col).
     * @default true
     */
    showSource?: boolean;
    /**
     * Colorize terminal output using ansis.
     * @default true
     */
    colors?: boolean;
    /**
     * Auto-inject the client patch into index.html.
     * If your app doesn’t serve index.html, set this to false and
     * `import 'virtual:browser-logs-to-terminal'` in your client entry.
     * @default true
     */
    injectHtml?: boolean;
    /**
     * Client-side batching controls (to avoid spamming the dev server).
     */
    batch?: {
        /** Flush when this many entries are queued. @default 20 */
        size?: number;
        /** Flush after this many ms if not yet flushed by size. @default 300 */
        interval?: number;
    };
    /**
     * Truncate large log lines (server-side). @default 10000 (characters)
     */
    truncate?: number;
    /**
     * Optional file logging configuration. Disabled by default.
     */
    fileLog?: {
        /** Enable writing forwarded logs to a file. @default false */
        enabled?: boolean;
        /** Directory to write logs to. @default 'logs/frontend' */
        dir?: string;
    };
}
declare function browserLogsToTerminal(opts?: BrowserLogsToTerminalOptions): Plugin;

export { browserLogsToTerminal as default };
export type { BrowserLogLevel, BrowserLogsToTerminalOptions };
