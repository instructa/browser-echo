# Browser Echo

![Browser Echo](public/banner.png)

Stream browser `console.*` logs to your dev terminal and optional file logging.

`browser-echo` makes it easy for you (and your AI coding assistant) to read client-side logs directly in the server terminal during development.

## Features

🤖 **AI Coding Assistant Support** - Perfect for Cursor AI, Claude Code, GitHub Copilot CLI, Gemini CLI, and other code editors that read terminal output

🚀 **Framework Support** - React, Vue, Nuxt 3/4, Next.js, TanStack Start, Vite-based frameworks, and custom setups

No production impact. Providers enable this across frameworks by injecting a tiny client patch and exposing a dev-only HTTP endpoint.

## Quick start

#### 1. Install Framework Package

First, set up Browser Echo for your framework:

| Framework | Quick Setup |
| --- | --- |
| TanStack / Vite | [Installation Guide](packages/vite/README.md#tanstack-start) |
| Nuxt 3/4 | [Installation Guide](packages/nuxt/README.md) |
| Next.js (App Router) | [Installation Guide](packages/next/README.md) |
| Vue + Vite | [Installation Guide](packages/vite/README.md#vue--vite) |
| React + Vite | [Installation Guide](packages/vite/README.md#react--vite) |
| Vue (non-Vite) | [Installation Guide](packages/vue/README.md) |
| React (non-Vite) | [Installation Guide](packages/react/README.md) |
| Core | [Installation Guide](packages/core/README.md) |

> Framework users only install their provider + `@browser-echo/core`. No cross‑framework bloat.

#### 2. Use Browser Echo MCP (Optional)

**⚠️ IMPORTANT:** You **must complete step 1** (framework setup) first before MCP will work. The MCP server needs your framework to forward browser logs to it.

**📖 [Set up Browser Echo MCP Server](packages/mcp/README.md)** for AI assistant integration

## What you get

- Drop‑in client patch that wraps `console.log/info/warn/error/debug`
- Batched posts (uses `sendBeacon` when possible)
- Source hints `(file:line:col)` + stack traces
- Colorized terminal output
- Optional file logging (Vite provider only)
- Works great with AI assistants reading your terminal
- **NEW:** MCP (Model Context Protocol) support for enhanced AI assistant integration

## Browser Echo MCP Server

Browser Echo includes built-in MCP (Model Context Protocol) server support, enabling AI assistants like Claude (via Cursor) to interact with your frontend logs using natural language commands:

- **"Check frontend logs"** - Retrieves recent console logs
- **"Show only errors from the last 2 minutes"** - Filters by level and time
- **"Find hydration mismatch warnings"** - Searches for specific content
- **"Clear logs and start fresh"** - Clears the buffer for new captures
- **"Focus on my current tab's logs"** - Filters by session

The MCP server exposes two main tools:
- `get_logs` - Fetch logs with extensive filtering (level, session, time, content)
- `clear_logs` - Clear logs with soft/hard modes and session-specific clearing

This integration makes debugging with AI assistants much more powerful - they can directly query and analyze your frontend logs without you having to copy/paste from the terminal.

**📖 [Full MCP Setup Guide & Documentation](packages/mcp/README.md)**

### MCP discovery and forwarding (Vite / Next / Nuxt)

- By default, when an MCP server is detected, frameworks forward logs to MCP and **suppress local terminal output**. If MCP is not found, they log locally.
- **Vite now auto‑discovers MCP** (no need to set `mcp.url`). It resolves in this order:
  1. Explicit option/env: Vite plugin `mcp.url` or `BROWSER_ECHO_MCP_URL`
  2. Discovery file written by the MCP server: `.browser-echo-mcp.json` (project root or OS tmp) containing `url` and `routeLogs`
  3. Port scan of common local ports (127.0.0.1 / localhost)
  4. Fallback to local terminal logging
- **Terminal output control:**
  - `BROWSER_ECHO_SUPPRESS_TERMINAL=1` — Force suppress terminal output (even when no MCP)
  - `BROWSER_ECHO_SUPPRESS_TERMINAL=0` — Force show terminal output (even when MCP forwarding)
  - Framework-specific options available (see individual framework package READMEs)

## Options

Most providers accept these options (names may appear as plugin options or component props):

```ts
type BrowserLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface BrowserEchoOptions {
  enabled?: boolean;                 // default: true (dev only)
  route?: `/${string}`;              // default: '/api/client-logs' (Next), '/__client-logs' (others)
  include?: BrowserLogLevel[];       // default: ['log','info','warn','error','debug']
  preserveConsole?: boolean;         // default: true (also keep logging in the browser)
  tag?: string;                      // default: '[browser]'
  // stacks
  stackMode?: 'none' | 'condensed' | 'full'; // default: 'full' (provider-specific; Vite supports all)
  showSource?: boolean;              // default: true (when available)
  // batching
  batch?: { size?: number; interval?: number }; // default: 20 / 300ms
  // server-side
  truncate?: number;                 // default: 10_000 chars (Vite)
  fileLog?: { enabled?: boolean; dir?: string }; // Vite-only
}
```

> Note: File logging and `truncate` are currently implemented in the Vite plugin’s dev server middleware. Nuxt/Next providers print to stdout by default (you can extend them if you need file output there).

## Production

* Providers apply only in development and inject nothing into your production client bundles.
* If you also want to strip `console.*` in prod builds, use your bundler’s strip tools (e.g. Rollup plugin) separately.

## Troubleshooting

* No logs appear

  * Vite: ensure plugin is added and either `index.html` exists or you import the virtual module manually.
  * Nuxt: confirm the module is in `modules[]` and you’re in dev mode.
* Next: make sure `app/api/client-logs/route.ts` is exported and `<BrowserEchoScript />` is rendered in `<head>`.

* Endpoint 404

  * Using a custom `base` or proxy? Keep the route same‑origin and not behind auth.
  * Nuxt sometimes proxies dev servers; our module registers a Nitro route directly.

* Too noisy

  * Limit to `['warn','error']` and use `stackMode: 'condensed'`.

* Duplicate logs in browser

  * Set `preserveConsole: false`.

## License

MIT


## Links

- X/Twitter: [@kregenrek](https://x.com/kregenrek)
- Bluesky: [@kevinkern.dev](https://bsky.app/profile/kevinkern.dev)

## Courses
- Learn Cursor AI: [Ultimate Cursor Course](https://www.instructa.ai/en/cursor-ai)
- Learn to build software with AI: [AI Builder Hub](https://www.instructa.ai)

## See my other projects:

* [codefetch](https://github.com/regenrek/codefetch) - Turn code into Markdown for LLMs with one simple terminal command
* [instructa](https://github.com/orgs/instructa/repositories) - Instructa Projects
