# @browser-echo/mcp

![Browser Echo MCP](../../public/browser-echo-mcp-banner.png)

MCP (Model Context Protocol) server for Browser Echo — enables AI assistants to directly access and analyze your frontend browser console logs using natural language commands.

## Example Usage

Ask your AI assistant questions like:

- **"Check frontend logs"** — Get recent console logs from your browser
- **"Show only errors from the last 2 minutes"** — Filter by level and time  
- **"Find hydration mismatch warnings"** — Search for specific issues
- **"Clear logs and start fresh"** — Reset the buffer for new captures

Your AI assistant will automatically use the appropriate MCP tools to fetch and analyze the logs without you needing to copy/paste from terminals.

---

## Installation

**⚠️ PREREQUISITE:** Before setting up the MCP server, you **must first install and configure a Browser Echo framework package** (Vite, Next.js, Nuxt, etc.) in your project. The MCP server needs your framework to forward browser logs to it.

**📖 [Choose your framework and complete setup first](../README.md#quick-start)**

> **💡 Configuration Tip:** Set `BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179/mcp` in your framework environment to explicitly configure MCP forwarding. See [Environment Variables](#environment-variables) for full configuration options.

Once your framework is set up and forwarding logs, install the Browser Echo MCP server with your client. Using stdio transport.

**Standard config** works in most of the tools:


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

### Cursor

<!-- [![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=browser-echo&config=eyJjb21tYW5kIjoibnB4IEBicm93c2VyLWVjaG8vbWNwIn0%3D) -->



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

### Claude Code

Add to your Claude Desktop MCP config:

```json
claude mcp add browser-echo-mcp npx @browser-echo/mcp
```


<details>
<summary>Claude Desktop</summary>

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.
</details>

<details>
<summary>Gemini CLI</summary>

Follow the MCP install [guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#configure-the-mcp-server-in-settingsjson), use the standard config above.
</details>

<details>
<summary>opencode</summary>

Follow the MCP Servers [documentation](https://opencode.ai/docs/mcp-servers/). For example in `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "browser-echo": {
      "type": "local",
      "command": [
        "npx",
        "@browser-echo/mcp"
      ],
      "enabled": true
    }
  }
}

```
</details>

<details>
<summary>VS Code</summary>

#### Click the button to install:

#### Or install manually:

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server), use the standard config above. You can also install the Browser Echo MCP server using the VS Code CLI:

```bash
# For VS Code
code --add-mcp '{"name":"browser-echo","command":"npx","args":["@browser-echo/mcp@latest"]}'
```

After installation, the Browser Echo MCP server will be available for use with your GitHub Copilot agent in VS Code.
</details>

<details>
<summary>Windsurf</summary>

Follow Windsurf MCP [documentation](https://docs.windsurf.com/windsurf/cascade/mcp). Use the standard config above.

</details>


### Streamable HTTP Setup (Server usage)

If you prefer HTTP transport (useful for web-based AI tools):

```bash
# Start with full HTTP transport
npx @browser-echo/mcp --http

# Custom host/port
npx @browser-echo/mcp --http --host 127.0.0.1 --port 5179
```

Point your MCP client to: `http://127.0.0.1:5179/mcp`

```json
{
  "mcpServers": {
    "browser-echo": {
      "url": "http://localhost:5179/mcp"
    }
  }
}
```

---

## Framework Options

Each framework package supports MCP configuration options:

| Framework | Install MCP Server |
| --- | --- |
| TanStack / Vite | [Install MCP Server](../vite/README.md#install-mcp-server) |
| Nuxt 3/4 | [Install MCP Server](../nuxt/README.md#install-mcp-server) |
| Next.js (App Router) | [Install MCP Server](../next/README.md#install-mcp-server) |
| Vue + Vite | [Install MCP Server](../vite/README.md#install-mcp-server) |
| React + Vite | [Install MCP Server](../vite/README.md#install-mcp-server) |
| Vue (non-Vite) | [Install MCP Server](../vue/README.md#install-mcp-server) |
| React (non-Vite) | [Install MCP Server](../react/README.md#install-mcp-server) |
| Core | [Install MCP Server](../core/README.md#install-mcp-server) |

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

// Filter by stream tag: '[browser]' | '[network]' | '[worker]'
get_logs({ tag: '[network]' })
```

**Parameters:**
- `level?: string[]` — Filter by log levels: `['log', 'info', 'warn', 'error', 'debug']`
- `session?: string` — 8-character session ID prefix to filter by specific browser tab
- `includeStack?: boolean` — Include stack traces (default: `false`)
- `limit?: number` — Maximum entries to return (default: `1000`, max: `5000`)
- `contains?: string` — Filter by substring in log text
- `sinceMs?: number` — Only logs with timestamp >= sinceMs
 - `tag?: '[browser]' | '[network]' | '[worker]'` — Filter by stream tag

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
- An **HTTP ingest server** runs on a local port (127.0.0.1) for browsers to POST logs
- The actual URL is written to `.browser-echo-mcp.json` in your project root
- Console output (stderr): `MCP (stdio) listening on stdio (ingest HTTP active)`

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
- Full **Streamable HTTP** MCP endpoint and HTTP ingest endpoint run on the specified host/port
- Console output: `MCP (Streamable HTTP) listening → http://127.0.0.1:<port>/mcp`

### Custom Configuration

```bash
# Custom ingest port in stdio mode (override ephemeral)
BROWSER_ECHO_INGEST_PORT=8081 node packages/mcp/bin/cli.mjs

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

Configure the MCP server behavior with these environment variables:

- `BROWSER_ECHO_MCP_URL=http://127.0.0.1:5179/mcp` — MCP server URL for framework forwarding (if set, frameworks bypass auto-discovery)
- `BROWSER_ECHO_BUFFER_SIZE=1000` — Max entries kept in memory (default: `1000`)
- `BROWSER_ECHO_INGEST_PORT=5179` — Force a fixed ingest port in stdio mode (default: 5179)
- `BROWSER_ECHO_SUPPRESS_TERMINAL=1` — Force suppress terminal output when MCP is forwarding logs
- `BROWSER_ECHO_SUPPRESS_TERMINAL=0` — Force show terminal output even when MCP is active
 - `BROWSER_ECHO_FILE_LOG=true` — Enable ingest-side file logging
 - `BROWSER_ECHO_SPLIT_LOGS=true` — Split logs to `logs/frontend/*`

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