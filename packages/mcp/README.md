# @browser-echo/mcp

MCP (Model Context Protocol) server for Browser Echo - captures and exposes frontend browser console logs to AI assistants.

## Overview

This package provides an MCP server using Streamable HTTP transport that:
- Captures frontend console logs (errors, warnings, info, debug)
- Exposes logs through MCP tools and resources for AI assistants
- Enables debugging of React hydration issues, network failures, and other frontend problems
- Supports session-based filtering and soft/hard log clearing
- Runs on HTTP transport for compatibility with browser-based log forwarding

## Installation

```bash
pnpm add -D @browser-echo/mcp
```

## Usage

Start the MCP server:

```bash
# Start on default port 5179
pnpm --package=@browser-echo/mcp dlx browser-echo-mcp

# Or with custom port
pnpm --package=@browser-echo/mcp dlx browser-echo-mcp --port 8080
```

The server exposes:
- MCP endpoint at `http://localhost:5179/mcp`
- Log ingestion at `http://localhost:5179/__client-logs`

### Available Tools

#### `get_logs` - Fetch Frontend Browser Logs

The primary tool for retrieving console logs. Supports extensive filtering options:

```typescript
// Example: Get all logs
get_logs()

// Example: Get only errors and warnings
get_logs({ level: ['error', 'warn'] })

// Example: Get logs from specific session
get_logs({ session: 'abc12345' })

// Example: Get logs containing "hydration"
get_logs({ contains: 'hydration' })

// Example: Get logs from last 5 minutes
get_logs({ sinceMs: Date.now() - 300000 })

// Example: Get last 10 errors without stack traces
get_logs({ 
  level: ['error'], 
  limit: 10, 
  includeStack: false 
})
```

**Parameters:**
- `level`: Filter by log levels (`['log', 'info', 'warn', 'error', 'debug']`)
- `session`: 8-character session ID prefix
- `includeStack`: Include stack traces (default: true)
- `limit`: Maximum entries to return (default: 1000, max: 5000)
- `contains`: Filter by substring in log text
- `sinceMs`: Only logs with timestamp >= sinceMs

**Returns:** Both text format (for display) and JSON format (for processing)

#### `clear_logs` - Clear Frontend Browser Logs

Clears the log buffer for fresh captures. Supports soft clearing (baseline) and session-specific clearing:

```typescript
// Example: Clear all logs (hard clear)
clear_logs()

// Example: Set baseline marker (soft clear) - old logs hidden but not deleted
clear_logs({ scope: 'soft' })

// Example: Clear only specific session
clear_logs({ session: 'abc12345', scope: 'hard' })

// Example: Set baseline for specific session
clear_logs({ session: 'abc12345', scope: 'soft' })
```

**Parameters:**
- `session`: 8-character session ID prefix (optional)
- `scope`: `'soft'` (set baseline) or `'hard'` (delete entries, default)

### Resources

The server also exposes logs as MCP resources:
- `browser-echo://logs` - All console logs
- `browser-echo://logs/{session}` - Logs for specific session

### Common Workflows

#### Debug Hydration Errors
```
1. User: "Clear logs and let me reproduce the hydration error"
   → clear_logs()
2. User reproduces the issue
3. User: "Check for hydration errors"
   → get_logs({ level: ['error', 'warn'], contains: 'hydration' })
```

#### Monitor Specific Session
```
1. User: "Show me all sessions"
   → get_logs() (check unique session IDs)
2. User: "Focus on session starting with 'a1b2'"
   → get_logs({ session: 'a1b2' })
```

#### Fresh Capture for Testing
```
1. clear_logs({ scope: 'soft' })  // Set baseline
2. Run tests
3. get_logs({ level: ['error', 'warn'] })  // Only new errors
```

### Environment Variables

- `BROWSER_ECHO_MCP_URL` - Override the default MCP server URL
- `BROWSER_ECHO_BUFFER_SIZE` - Maximum log entries to keep in memory (default: 1000)

## API

### `startMcpServer(options?)`

Start the MCP server (called automatically by framework integrations).

```typescript
import { startMcpServer } from '@browser-echo/mcp';

startMcpServer({
  name: 'My App Logs',
  version: '1.0.0',
  bufferSize: 2000  // Max entries in memory
});
```

### `publishLogEntry(entry)`

Publish a log entry to the MCP server.

```typescript
import { publishLogEntry } from '@browser-echo/mcp';

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

## Integration with AI Assistants

The MCP server works with any MCP-compatible client. For Cursor, add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "browser-echo": {
      "url": "http://localhost:5179/mcp"
    }
  }
}
```

### Natural Language Commands

Users can interact with logs using natural language:
- "Check frontend logs"
- "Show only errors from the last 2 minutes"
- "Find hydration mismatch warnings"
- "Clear logs and start fresh"
- "Focus on my current tab's logs"

The AI assistant will automatically use the appropriate tools with the right parameters.

## Advanced Features

### Soft vs Hard Clear

- **Soft Clear**: Sets a baseline timestamp. Old logs are hidden but remain in memory. Useful for focusing on new logs without losing history.
- **Hard Clear**: Completely removes logs from memory. Use when you need a truly fresh start.

### Session Management

Each browser tab/session gets a unique ID. You can:
- Filter logs by session to focus on specific user interactions
- Clear logs for individual sessions
- Track issues across multiple browser tabs

### Performance

- Logs are stored in a ring buffer (default 1000 entries)
- Old entries are automatically removed when buffer is full
- Minimal overhead on your application
- File logging remains separate and unaffected

## License

MIT
