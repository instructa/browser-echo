export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface InitBrowserEchoOptions {
  route?: `/${string}`;
  include?: BrowserLogLevel[];
  preserveConsole?: boolean;
  tag?: string;
  batch?: { size?: number; interval?: number };
  stackMode?: 'full' | 'condensed' | 'none';

  /** Optional: where frameworks should look for Browser Echo file logs (default ".browser-echo"). */
  logDirectory?: string;

  /** Optional: preferred session mode; used by tooling that creates/reads sessions. */
  sessionMode?: 'timestamped' | 'single';
}
