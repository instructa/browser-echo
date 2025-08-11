import { BrowserLogLevel } from '@browser-echo/core';
import { JSX } from 'react';

interface BrowserEchoScriptProps {
    route?: `/${string}`;
    include?: BrowserLogLevel[];
    preserveConsole?: boolean;
    tag?: string;
    batch?: {
        size?: number;
        interval?: number;
    };
}
declare function BrowserEchoScript(props: BrowserEchoScriptProps): JSX.Element;

export { BrowserEchoScript as default };
export type { BrowserEchoScriptProps };
