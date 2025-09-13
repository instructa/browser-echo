# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2025-09-XX

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
