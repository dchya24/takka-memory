# takka-memory — Design Spec

**Date:** 2026-11-23
**Status:** Approved (pending implementation plan)
**Replaces:** pi-zcode-memory v0.1.0 (zcode-coupled bridge extension)

## Problem & Goal

The current extension (`pi-zcode-memory`) is a bridge: pi reads/writes zcode's
per-project memory store at `~/.zcode/cli/memories/projects/`. This ties pi's
memory to zcode's layout, scopes every memory to a single project, and is
useless unless zcode is installed.

**Goal:** a standalone, agent-agnostic persistent memory system named
**takka-memory**, usable from multiple agent harnesses (pi extension, MCP
server for Claude Code/Cursor/etc., CLI), with a **global scope** across all
projects plus per-project scope. zcode is no longer a dependency; existing
zcode memories are reachable via a one-shot migration command. The live zcode
bridge was considered and **dropped** (user decision).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope model | Global + per-project store; `write` defaults to `project`, `global` must be explicit |
| Naming / compat | Rename tools to `memory_*`; keep `zcode_memory_*` as deprecated aliases |
| Distribution | Single npm package `takka-memory` with core + adapters inside (no monorepo) |
| zcode interop | No live bridge. One-shot `import-zcode` migration only |

## Architecture

One package, three surfaces over one core:

```
takka-memory/
├── src/
│   ├── core/                 # pure TS engine — zero harness dependencies
│   │   ├── paths.ts          # root resolution, project key, scope dirs
│   │   ├── frontmatter.ts    # parse/build frontmatter blocks
│   │   ├── index-md.ts       # parse/upsert/remove MEMORY.md index lines
│   │   └── store.ts          # list/read/search/write/delete per scope
│   ├── adapters/
│   │   └── pi.ts             # pi extension: prompt injection + native tools
│   ├── mcp/
│   │   └── server.ts         # MCP stdio server (same 5 tools)
│   └── cli.ts                # CLI entry
├── bin/takka-memory.js       # shebang launcher → cli.ts
├── extensions/takka-memory.ts  # entry point read by `pi install`
├── integrations/claude-code/ # CLAUDE.md snippet + optional skill markdown
└── package.json              # name: takka-memory, bin, pi-package keywords
```

Adapter deps stay per-file: the pi adapter alone imports `@earendil-works/pi-ai`
(Type) and `@earendil-works/pi-coding-agent` types; the MCP adapter uses
`@modelcontextprotocol/sdk`; core imports only `node:*`.

## Storage Layout

```
~/.takka/memory/                 # override: TAKKA_MEMORY_ROOT
├── MEMORY.md                    # GLOBAL index
├── <slug>.md                    # global memories
└── projects/<project-key>/
    ├── MEMORY.md                # PROJECT index
    └── <slug>.md                # project memories
```

- `project-key = <basename(cwd)>-<sha256(cwd)[0..16]>` — **same scheme as
  today**, so zcode stores migrate 1:1 with no transformation.
- Memory file format unchanged (portable markdown):

```markdown
---
name: prefer-ssh-git-remotes
description: User prefers SSH over HTTPS for git remotes
metadata:
  type: feedback
---

**Why:** ... **How to apply:** ...
```

- Index line format: `- [Title](file.md) — hook`.
- Types: `user | feedback | project | reference`; `[[name]]` links between
  memories; absolute dates.

## Core Semantics (scope model)

All operations take `scope: "global" | "project"`.

| Op | Behavior |
|---|---|
| `list` | Both scopes merged; entries labeled `[global]` / `[project]`; returns "no memories yet" messages per empty scope |
| `search <query>` | Case-insensitive across both scopes; hits prefixed with scope + relative path |
| `read <name>` | `scope` optional; resolution order: **project → global** (fallback). Result states which scope served it |
| `write` | `scope` optional, **default `"project"`**; global only when explicitly passed. Slugified filename; upserts index line |
| `delete <name>` | Resolution order project → global; result names the deleted scope; errors if not found in either |

Name resolution and traversal guard (existing `resolveMemoryFile` logic) are
kept: candidates `name`, `name.md`, slugified variants, all constrained inside
the scope dir.

## Adapter: pi (full-featured)

Entry: `extensions/takka-memory.ts` (thin re-export of `src/adapters/pi.ts`).

- **System prompt injection** (`before_agent_start`): two optional sections —
  `## Takka Memory (global)` and `## Takka Memory (project)` — each with the
  scope's index (skipped when empty/index missing). Same 8000-char truncation
  guard as today. Copy explains: global = everywhere, project = this repo,
  default write scope is project, and when to persist ("remember this",
  durable preferences/decisions).
- **Native tools** (renamed): `memory_list`, `memory_read`, `memory_search`,
  `memory_write`, `memory_delete` — parameters mirror core semantics; `scope`
  enum `global | project` on read/write/delete.
- **Deprecated aliases**: `zcode_memory_list/read/search/write/delete` register
  the same handlers; every alias response appends
  `(deprecated — use memory_*)`. Removed no earlier than next major.
- **Env**: `TAKKA_MEMORY_DISABLE=1` disables everything;
  `TAKKA_MEMORY_ROOT` overrides the store root. The old `ZCODE_*` vars are
  removed.
- No zcode bridge (dropped).

## Adapter: MCP server

`npx takka-memory mcp` — stdio MCP server built on `@modelcontextprotocol/sdk`.

- Exposes the same five tools with identical semantics/parameter schemas
  (zod instead of pi-ai Type).
- Cannot inject context: for Claude Code the repo ships
  `integrations/claude-code/` with (a) a CLAUDE.md snippet and (b) an optional
  skill file instructing the agent to run `takka-memory list` (CLI) at session
  start and to persist durable facts via `memory_write`.
- Install: `claude mcp add takka-memory -- npx takka-memory mcp`.

## CLI

`bin/takka-memory.js` → `src/cli.ts`. Subcommands:

| Command | Purpose |
|---|---|
| `mcp` | Start the MCP stdio server |
| `import-zcode [--dry-run] [--zcode-root <dir>]` | Copy every project store from `~/.zcode/cli/memories/projects/<key>/memory/` into `~/.takka/memory/projects/<key>/`. Non-destructive (copy, not move); per file: identical target → skipped, missing target → copied, differing target → overwritten (zcode store is migration source of truth) and counted as updated; prints a per-project summary. `--dry-run` prints the same summary without writing |
| `list [scope]` | Inspect merged or single-scope index |
| `read <name>` | Read one memory (project → global fallback) |
| `search <query>` | Text search |
| `path` | Print resolved root + current project dir |

## Error Handling

- Missing files/dirs → friendly "not found, run memory_list first" messages;
  tools return `isError` instead of throwing.
- Reads are always safe (null on failure). Writes `mkdir -p` the scope dir.
- Index maintenance: plain `readFileSync`/`writeFileSync` (no locking) — same
  risk profile as today; single-agent-at-a-time usage assumed.
- CLI returns non-zero exit codes on error; `--dry-run` never writes.

## Testing (vitest, new)

- **Core unit tests**: project-key hashing, index parse/upsert/remove,
  frontmatter parse/build, slugify, traversal guard, store CRUD with
  `TAKKA_MEMORY_ROOT` pointed at a tmp dir, scope fallback rules.
- **CLI integration tests**: `import-zcode` against a fixture zcode store
  (tmp root), `--dry-run` idempotence, `list/read/search`.
- **MCP tests**: spawn server over stdio, initialize handshake, one tool call
  round-trip (`memory_list`).
- **Pi adapter tests**: tool handlers invoked directly with tmp root
  (no live pi session needed); prompt-injection builder tested as a pure
  function.

## Migration & Release

- Version bump to `0.2.0`; README rewritten (multi-harness story, install per
  harness, scope model, env vars); CHANGELOG entry.
- Repo/package renamed `pi-zcode-memory` → `takka-memory` (git remote/repo
  rename done by owner on GitHub).
- Existing users migrate with `npx takka-memory import-zcode`; old data stays
  untouched in the zcode store.
- pi's built-in private memory (`~/.pi/agent/memory`) remains untouched.

## Out of Scope (v1)

- Live zcode bridge (dropped by decision)
- Claude Code marketplace plugin packaging (docs + skill file only)
- Embeddings/semantic search; sync/merge across machines; multi-user locking
