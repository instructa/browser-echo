type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
interface InitBrowserEchoOptions {
    route?: `/${string}`;
    include?: BrowserLogLevel[];
    preserveConsole?: boolean;
    tag?: string;
    batch?: {
        size?: number;
        interval?: number;
    };
}

export type { BrowserLogLevel, InitBrowserEchoOptions };
