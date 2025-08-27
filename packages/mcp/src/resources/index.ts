import type { McpResourceContext } from '../types';
import { registerBrowserLogsResource } from './browserLogs';
import { registerBrowserLogsSessionResource } from './browserLogsSession';

/** Register resources for the MCP server */
export function registerResources(context: McpResourceContext) {
  // TODO: Switch these to file-backed reads when .browser-echo is present:
  //  - Provide resources.list that enumerates browser-echo://logs and browser-echo://logs/{session}
  //  - Provide resources.subscribe to stream deltas via chokidar
  // For now, keep existing in-memory resources for HTTP mode compatibility.
  registerBrowserLogsResource(context);
  registerBrowserLogsSessionResource(context);
}
