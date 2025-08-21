import type { McpResourceContext } from '../types';
import { registerBrowserLogsResource } from './browserLogs';
import { registerBrowserLogsSessionResource } from './browserLogsSession';

/** Register resources for the MCP server */
export function registerResources(context: McpResourceContext) {
  registerBrowserLogsResource(context);
  registerBrowserLogsSessionResource(context);
}
