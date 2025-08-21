# @browser-echo/mcp

MCP (Model Context Protocol) server for Browser Echo — enables AI assistants to directly access and analyze your frontend browser console logs using natural language commands.

## Example Usage

Ask your AI assistant questions like:

- **"Check frontend logs"** — Get recent console logs from your browser
- **"Show only errors from the last 2 minutes"** — Filter by level and time  
- **"Find hydration mismatch warnings"** — Search for specific issues
- **"Clear logs and start fresh"** — Reset the buffer for new captures

Your AI assistant will automatically use the appropriate MCP tools to fetch and analyze the logs without you needing to copy/paste from terminals.

---

## Installation for AI Assistants

### Cursor IDE

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "browser-echo": {
      "command": "npx",
      "args": ["@browser-echo/mcp"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "browser-echo": {
      "command": "npx",
      "args": ["@browser-echo/mcp"]
    }
  }
}
```

---

## Streamable HTTP Setup

If you prefer HTTP transport over stdio (useful for web-based AI tools):

### 1. Install the package

```bash
npm install -g @browser-echo/mcp
# or
pnpm add -g @browser-echo/mcp
```

### 2. Start the HTTP server

```bash
# Start with full HTTP transport
npx @browser-echo/mcp --http

# Custom host/port
npx @browser-echo/mcp --http --host 127.0.0.1 --port 5179
```

### 3. Configure your AI assistant

Point your MCP client to: `http://127.0.0.1:5179/mcp`

---

## Available Tools

### `get_logs` — Fetch Frontend Browser Logs

Retrieve console logs with extensive filtering options:

```typescript
// Get all logs
get_logs()

// Filter by log levels
get_logs({ level: ['error', 'warn'] })

// Filter by session (8-character session ID)
get_logs({ session: 'abc12345' })

// Search for specific content
get_logs({ contains: 'hydration' })

// Get logs from last 5 minutes
get_logs({ sinceMs: Date.now() - 300000 })

// Limit results and exclude stack traces
get_logs({ level: ['error'], limit: 10, includeStack: false })
```

**Parameters:**
- `level?: string[]` — Filter by log levels: `['log', 'info', 'warn', 'error', 'debug']`
- `session?: string` — 8-character session ID prefix to filter by specific browser tab
- `includeStack?: boolean` — Include stack traces (default: `false`)
- `limit?: number` — Maximum entries to return (default: `1000`, max: `5000`)
- `contains?: string` — Filter by substring in log text
- `sinceMs?: number` — Only logs with timestamp >= sinceMs

**Returns:** Formatted text suitable for AI analysis + structured JSON data

### `clear_logs` — Clear Frontend Browser Logs

Reset the log buffer for fresh captures:

```typescript
// Hard clear - delete all logs
clear_logs()

// Soft clear - set baseline (hide old logs but keep in memory)
clear_logs({ scope: 'soft' })

// Clear logs for specific session
clear_logs({ session: 'abc12345', scope: 'hard' })
clear_logs({ session: 'abc12345', scope: 'soft' })
```

**Parameters:**
- `session?: string` — 8-character session ID prefix (optional)
- `scope?: 'soft' | 'hard'` — `'soft'` sets baseline, `'hard'` deletes entries (default: `'hard'`)

---

## Available Resources

- `browser-echo://logs` — All console logs as MCP resource
- `browser-echo://logs/{session}` — Logs for specific session as MCP resource

---

## CLI Reference

### Transport Selection

By default, the server uses **stdio transport** (best for local AI assistants). It automatically switches to **HTTP transport** when you specify non-default network options.

```bash
# Default: stdio transport + HTTP ingest endpoint
npx @browser-echo/mcp

# Force HTTP transport
npx @browser-echo/mcp --http

# Auto-switch to HTTP (when non-default options provided)
npx @browser-echo/mcp --port 8080        # → HTTP mode
npx @browser-echo/mcp --host 0.0.0.0     # → HTTP mode
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--http` | `false` | Force Streamable HTTP transport instead of stdio |
| `--host` | `127.0.0.1` | Host for ingest server (stdio) or full server (HTTP) |
| `--port` | `5179` | Port for ingest server (stdio) or full server (HTTP) |
| `--logsRoute` | `/__client-logs` | Path for the logs ingest route |
| `--endpoint` | `/mcp` | MCP endpoint path (only used with `--http`) |
| `--buffer` | `1000` | Max in-memory entries kept by the ring buffer |

**Cross-platform:** Works on macOS, Linux, and Windows. No native dependencies.

---

## Development Usage

### Stdio Mode (Default)

Best for local development with AI assistants:

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "browser-echo": {
      "command": "node",
      "args": ["packages/mcp/bin/cli.mjs"]
    }
  }
}
```

In stdio mode:
- MCP communication happens over **stdio** (no HTTP MCP endpoint)
- An **HTTP ingest server** runs at `http://127.0.0.1:5179/__client-logs` for browsers to POST logs
- Console output: `MCP (stdio) listening on stdio (ingest HTTP active)`

### HTTP Mode

For web-based AI tools or when you need HTTP MCP access:

```json
// .cursor/mcp.json  
{
  "mcpServers": {
    "browser-echo": {
      "command": "node", 
      "args": ["packages/mcp/bin/cli.mjs", "--http"]
    }
  }
}
```

In HTTP mode:
- Full **Streamable HTTP** MCP endpoint at `http://127.0.0.1:5179/mcp`
- HTTP ingest endpoint at `http://127.0.0.1:5179/__client-logs`
- Console output: `MCP (Streamable HTTP) listening → http://127.0.0.1:5179/mcp`

### Custom Configuration

```bash
# Custom ingest port in stdio mode
node packages/mcp/bin/cli.mjs --port 8081

# Custom HTTP server  
node packages/mcp/bin/cli.mjs --http --host 0.0.0.0 --port 5179
```

---

## How Logs Reach the Server

### Browser → Ingest (Recommended)

Your framework packages automatically send logs to the ingest endpoint:

```typescript
// Browser automatically POSTs to ingest endpoint
POST http://127.0.0.1:5179/__client-logs
{
  "sessionId": "tab-123",
  "entries": [
    { 
      "level": "error", 
      "text": "Failed to fetch user", 
      "time": 1724200000000, 
      "source": "api.ts:42", 
      "stack": "Error: ..." 
    }
  ]
}
```

### Framework Forwarding

Framework packages (Next.js, Nuxt, etc.) can forward logs to the MCP server:

```bash
# Set this in your app's environment
export BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179/mcp
```

When set, framework handlers automatically forward browser logs to the MCP ingest endpoint.

---

## Programmatic API

Start the MCP server programmatically in your Node.js application:

```typescript
import { startMcpServer, publishLogEntry } from '@browser-echo/mcp';

// Start HTTP MCP server in-process
await startMcpServer({
  name: 'My App Logs',
  version: '1.0.0',
  bufferSize: 2000,
  host: '127.0.0.1',
  port: 5179,
  endpoint: '/mcp',
  logsRoute: '/__client-logs'
});

// Publish log entries programmatically
publishLogEntry({
  sessionId: 'user-123',
  level: 'error',
  text: 'Failed to fetch user data',
  time: Date.now(),
  source: 'api.ts:42',
  stack: 'Error: Failed to fetch...',
  tag: '[api]'
});
```

> **Note:** If `BROWSER_ECHO_MCP_URL` is set, `startMcpServer()` becomes a no-op to avoid duplicate servers.

---

## Environment Variables

- `BROWSER_ECHO_BUFFER_SIZE` — Max entries in memory (default: `1000`)
- `BROWSER_ECHO_MCP_URL` — MCP server URL for framework forwarding (e.g., `http://127.0.0.1:5179/mcp`)

---

## Common Workflows

### Debug Hydration Errors
```
1. User: "Clear logs and let me reproduce the hydration error"
   → clear_logs({ scope: 'soft' })
2. User reproduces the issue in browser
3. User: "Check for hydration errors"  
   → get_logs({ level: ['error', 'warn'], contains: 'hydration' })
```

### Monitor Specific Browser Tab
```
1. User: "Show me all active sessions"
   → get_logs() // Look for unique session IDs
2. User: "Focus on session starting with 'a1b2'"
   → get_logs({ session: 'a1b2' })
```

### Fresh Error Capture
```
1. clear_logs({ scope: 'soft' })  // Set baseline
2. Run tests or reproduce issue
3. get_logs({ level: ['error', 'warn'] })  // Only new errors
```

---

## Security

**Local Development Defaults:**
- CORS headers are permissive (`Access-Control-Allow-Origin: *`) 
- Binds to `127.0.0.1` by default for local-only access
- When exposing over network, add authentication/proxy as needed

---

## License

MIT