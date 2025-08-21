import type { McpResourceContext } from '../types';

/** Register browser logs resource */
export function registerBrowserLogsResource({ mcp, store }: McpResourceContext) {
  mcp.registerResource(
    'browser-logs',
    'browser-echo://logs',
    {
      title: 'Frontend Browser Console Logs',
      description: 'Recent frontend logs, console errors, warnings, hydration issues, and network failures captured by Browser Echo',
      mimeType: 'text/plain'
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: store.toText() }]
    })
  );
}
