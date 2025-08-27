import type { McpToolContext } from '../types';
import { registerGetLogsTool } from './getLogs';
import { registerClearLogsTool } from './clearLogs';
import { registerGetNetworkLogsTool } from './getNetworkLogs';

/** Register tools for the MCP server */
export function registerTools(context: McpToolContext) {
  registerGetLogsTool(context);
  registerClearLogsTool(context);
  registerGetNetworkLogsTool(context);
}
