# Changelog

## [0.1.0] - 2026-11-15

### Added

- Initial release.
- Memory-index injection into pi's system prompt every turn (`before_agent_start`).
- Tools: `zcode_memory_list`, `zcode_memory_read`, `zcode_memory_search`, `zcode_memory_write`, `zcode_memory_delete`.
- Index auto-maintenance on write/delete; slug-based file resolution with path-traversal protection.
- Env configuration: `ZCODE_MEMORY_DISABLE` kill switch, `ZCODE_MEMORIES_ROOT` override.
