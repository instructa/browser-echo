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
    stackMode?: 'full' | 'condensed' | 'none';
}
declare const module: any;

export { module as default };
export type { NuxtBrowserEchoOptions };
