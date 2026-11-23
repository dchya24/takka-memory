# Changelog

## [0.2.0] - 2026-11-23

### Breaking

- Renamed package/repo to **takka-memory**; the store is now standalone at `~/.takka/memory/` — no longer reads/writes zcode's store, and the live zcode bridge is removed.
- Env vars renamed: `ZCODE_MEMORY_DISABLE` → `TAKKA_MEMORY_DISABLE`, `ZCODE_MEMORIES_ROOT` → `TAKKA_MEMORY_ROOT`.
- pi tools renamed to `memory_list/read/search/write/delete`; `zcode_memory_*` remain as deprecated aliases (same handlers) until the next major.

### Added

- **Global scope**: memories available across all projects (`~/.takka/memory/MEMORY.md`), alongside per-project memories. `memory_write` defaults to `project`; `global` is explicit. Reads fall back project → global; list/search merge both scopes with labels.
- **MCP server** (`takka-memory mcp`) exposing the same five tools for Claude Code, Cursor, and any MCP-capable harness, plus `integrations/claude-code/` snippet and optional skill for session-start recall.
- **CLI**: `list`, `read`, `search`, `path`, `mcp`, and `import-zcode` (non-destructive one-shot migration from `~/.zcode/cli/memories/projects`, `--dry-run` supported).
- Test suite (vitest): core units, CLI integration, MCP stdio round-trip, pi adapter handlers + prompt injection.

## [0.1.0] - 2026-11-15

### Added

- Initial release.
- Memory-index injection into pi's system prompt every turn (`before_agent_start`).
- Tools: `zcode_memory_list`, `zcode_memory_read`, `zcode_memory_search`, `zcode_memory_write`, `zcode_memory_delete`.
- Index auto-maintenance on write/delete; slug-based file resolution with path-traversal protection.
- Env configuration: `ZCODE_MEMORY_DISABLE` kill switch, `ZCODE_MEMORIES_ROOT` override.
