import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LogStore } from './store';

export interface McpToolContext {
  mcp: McpServer
  store: LogStore
}

export interface McpResourceContext {
  mcp: McpServer
  store: LogStore
}

// Define the options type
export interface McpServerOptions {
  name: string
  version: string
}

export type Tools = (context: McpToolContext) => void
export type Resources = (context: McpResourceContext) => void