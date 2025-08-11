import { BrowserLogLevel } from '@browser-echo/core';
import { JSX } from 'react';

interface BrowserEchoScriptProps {
    enabled?: boolean;
    route?: `/${string}`;
    include?: BrowserLogLevel[];
    preserveConsole?: boolean;
    tag?: string;
    stackMode?: 'none' | 'condensed' | 'full';
    showSource?: boolean;
    batch?: {
        size?: number;
        interval?: number;
    };
}
declare function BrowserEchoScript(props: BrowserEchoScriptProps): JSX.Element;

export { BrowserEchoScript as default };
export type { BrowserEchoScriptProps };
