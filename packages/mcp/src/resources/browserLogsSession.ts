import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import { validateSessionId } from '../store';
import type { McpResourceContext } from '../types';

/** Register browser logs session resource */
export function registerBrowserLogsSessionResource({ mcp, store }: McpResourceContext) {
  mcp.registerResource(
    'browser-logs-session',
    new ResourceTemplate('browser-echo://logs/{session}', { list: undefined }),
    {
      title: 'Browser Console Logs (per session)',
      description: 'Console logs for a specific session ID',
      mimeType: 'text/plain'
    },
    async (uri, { session }) => {
      const sid = validateSessionId(Array.isArray(session) ? session[0] : session);
      return { contents: [{ uri: uri.href, text: store.toText(sid) }] };
    }
  );
}
