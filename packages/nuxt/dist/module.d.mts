interface NuxtBrowserEchoOptions {
    enabled?: boolean;
    route?: `/${string}`;
    include?: Array<'log' | 'info' | 'warn' | 'error' | 'debug'>;
    preserveConsole?: boolean;
    tag?: string;
    batch?: {
        size?: number;
        interval?: number;
    };
}

export type { NuxtBrowserEchoOptions };
