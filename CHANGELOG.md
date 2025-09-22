# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-09-22

### Added
- **Network Logs (opt-in)**: Capture fetch, XMLHttpRequest, and WebSocket as `[network]` entries alongside console logs. Disabled by default; enable via `networkLogs.enabled: true` (Vite/Next/Nuxt/Core).
- **Tag Filtering**: `get_logs({ tag })` and diagnostics `GET /__client-logs?tag=...` to filter by stream tag (`[browser]`, `[network]`, `[worker]`).
- **Worker Runtime (internal)**: Dev-only worker console capture runtime available in core (not exported publicly by default).
- **MCP File Logging (opt-in)**: Enable ingest-side file logging with `BROWSER_ECHO_FILE_LOG=true` and optional split via `BROWSER_ECHO_SPLIT_LOGS=true`.

### Changed
- Removed protocol from network log text. Format now: `[NETWORK] [METHOD] [URL] [STATUS] [DURATION ms]` and WS events `[WS OPEN/CLOSE/ERROR]`.
- Next/Nuxt handlers now suppress terminal only when `BROWSER_ECHO_MCP_URL` is set.

## [1.0.2] - 2025-09-13

### Fixed
- **File Logging Stack Mode**: Fixed file logging to properly respect `stackMode` configuration, ensuring that both `full` and `condensed` stack modes work correctly when writing logs to files
- **Stack Trace Formatting**: Enhanced stack logging in middleware to properly format stack traces according to the configured stack mode

## [1.0.1] - 2025-08-24

### Changed
- **Configuration System**: Migrated from `.browser-echo-mcp.json` to `.cursor/mcp.json` for better Cursor IDE integration and cleaner project setup
- **MCP Server Configuration**: Updated MCP server configuration to use the new Cursor-native format for improved developer experience

### Fixed
- **Workspace Dependencies**: Fixed workspace dependency versioning to ensure proper publishing of packages with correct version references

## [1.0.0] - 2025-08-XX

### Added
- Initial release of Browser Echo MCP
- Support for streaming browser console logs to development terminals and AI assistants
- Framework support for React, Vue, Nuxt 3/4, Next.js, TanStack Start, and Vite-based frameworks
- MCP (Model Context Protocol) server for AI assistant integration
- Optional file logging with configurable stack trace modes
- Colorized terminal output
- Source hints with file:line:col information
- Batched log transmission using `sendBeacon` when available
