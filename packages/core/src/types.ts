export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface InitBrowserEchoOptions {
  route?: `/${string}`;
  include?: BrowserLogLevel[];
  preserveConsole?: boolean;
  tag?: string;
  batch?: { size?: number; interval?: number };
}
