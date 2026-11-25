# Changelog

## [0.3.0] - 2026-11-24

### Breaking

- Removed the deprecated `zcode_memory_*` tool aliases from the pi extension. Use `memory_list` / `memory_read` / `memory_search` / `memory_write` / `memory_delete`.

### Added

- **Concurrency safety**: writes to one scope are serialized with a per-directory lock (`.lock`), and memory files plus the `MEMORY.md` index are written atomically (temp file + rename). Concurrent agents can no longer interleave into a torn index. Stale locks from a crashed process are recovered automatically.
- **Search limits**: `memory_search` (MCP) and `memory_search` (pi) accept an optional `limit` (1–200, default 40); the CLI accepts `search --limit N <query...>`. Searches also honour an abort signal so a cancelled run stops scanning early.
- **Per-request working directory**: the pi adapter and the MCP server resolve the working directory on every call (pi uses the session cwd from the tool context) instead of capturing it once at load time, so a workspace switch mid-session no longer reads a stale scope.

### Fixed

- **Frontmatter parsing** now handles CRLF files, quoted scalars (single/double, with escapes), trailing `#` comments, top-level `type:` as well as nested `metadata.type:`, and ignores unknown keys. Descriptions containing a colon or a `#` are quoted on write and survive a round-trip.
- `import-zcode` uses `os.homedir()` instead of `$HOME`, so the default zcode path resolves correctly on Windows and in environments without `HOME`.

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
