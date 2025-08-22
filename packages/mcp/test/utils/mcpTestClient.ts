/**
 * @fileoverview MCP test client for testing the MCP server (stdio transport)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpTestClientOptions {
  cliEntryPoint: string; // absolute path to cli.mjs
  cwd?: string; // optional working directory for the server process
  env?: Record<string, string>; // optional environment variables for the server process
}

export class McpTestClient {
  private client: Client;
  private transport: StdioClientTransport | undefined;
  private options: McpTestClientOptions;

  constructor(options: McpTestClientOptions) {
    this.options = options;
    this.client = new Client(
      { name: 'browser-echo-mcp-test-client', version: '0.1.0' },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: { list: {}, call: {} },
        },
      },
    );
  }

  async connect(args: string[] = []): Promise<void> {
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [this.options.cliEntryPoint, ...args],
      cwd: this.options.cwd,
      env: this.options.env,
    });
    await this.client.connect(this.transport);
  }

  async connectServer(args: string[] = []): Promise<void> {
    return this.connect(['server', ...args]);
  }

  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }
  }

  async listTools(): Promise<any> {
    return await this.client.listTools();
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    return await this.client.callTool({ name, arguments: args });
  }
}


