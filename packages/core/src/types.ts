export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface NetworkCaptureOptions {
  enabled?: boolean;
  captureFetch?: boolean;
  captureXmlHttpRequest?: boolean;
}

export interface InitBrowserEchoOptions {
  route?: `/${string}`;
  include?: BrowserLogLevel[];
  preserveConsole?: boolean;
  tag?: string;
  batch?: { size?: number; interval?: number };
  stackMode?: 'full' | 'condensed' | 'none';
  network?: NetworkCaptureOptions;
}
