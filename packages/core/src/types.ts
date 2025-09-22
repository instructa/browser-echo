export type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface InitBrowserEchoOptions {
  route?: `/${string}`;
  include?: BrowserLogLevel[];
  preserveConsole?: boolean;
  tag?: string;
  batch?: { size?: number; interval?: number };
  stackMode?: 'full' | 'condensed' | 'none';
  networkLogs?: {
    enabled?: boolean;
    captureFull?: boolean;
    bodies?: {
      request?: boolean;
      response?: boolean;
      maxBytes?: number;
      allowContentTypes?: string[];
      prettyJson?: boolean;
    };
  };
}
