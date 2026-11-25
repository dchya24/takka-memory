# takka-memory

**Agent-agnostic persistent memory** — a global + per-project markdown memory store that works across coding-agent harnesses: a [pi](https://pi.dev) extension, an MCP server for Claude Code / Cursor / any MCP-capable agent, and a small CLI. No server, no database: memories are plain markdown files.

Formerly `pi-zcode-memory` (a bridge into zcode's memory store). takka-memory owns its store; existing zcode memories can be imported once with `takka-memory import-zcode`.

## How it works

One store, two scopes:

```
~/.takka/memory/                    # GLOBAL — recalled in every project
├── MEMORY.md                       # global index: `- [Title](file.md) — hook`
├── prefer-ssh-remotes.md
└── projects/<project-key>/         # PROJECT — this workspace only
    ├── MEMORY.md                   # project index
    └── ci-test-gotcha.md
```

`project-key = <basename(cwd)>-<first 16 hex of sha256(cwd)>` — the same scheme zcode uses, so imported memories land 1:1.

Each memory is one markdown file with frontmatter; each scope has a `MEMORY.md` index that agents read at session start.

### Scope rules

| Operation | Behavior |
|---|---|
| `memory_write` | `scope` defaults to **`project`**; pass `"global"` explicitly for cross-project facts |
| `memory_read` / `memory_delete` | without `scope`: **project wins**, then global fallback |
| `memory_list` / `memory_search` | both scopes merged, entries labeled `[global]` / `[project]` |

## Install

### pi (native extension — prompt injection + tools)

```bash
pi install git:github.com/dchya24/takka-memory
# or from npm:
pi install npm:takka-memory
```

pi injects both memory indexes into the system prompt every turn and registers five tools:

`memory_list` · `memory_read` · `memory_search` · `memory_write` · `memory_delete`

> Upgrading from pi-zcode-memory? The old `zcode_memory_*` tools were removed in v0.3.0 — use the `memory_*` names. Run `npx takka-memory import-zcode` once to copy your zcode memories into the new store.

### Claude Code / Cursor / any MCP-capable harness

```bash
claude mcp add takka-memory -- npx takka-memory mcp
```

The MCP server exposes the same five tools. Because MCP can't inject context, also add the snippet from [`integrations/claude-code/CLAUDE-snippet.md`](integrations/claude-code/CLAUDE-snippet.md) to your `CLAUDE.md` (or install the optional skill in the same folder) so the agent loads the index at session start.

### CLI

```bash
npx takka-memory <command>
  mcp                                  Start the MCP stdio server
  list [global|project]                List memories (both scopes if omitted)
  read <name>                          Read one memory (project wins over global)
  search [--limit N] <query...>        Case-insensitive text search (max N hits, 1-200)
  path                                 Print store root and current project dir
  import-zcode [--dry-run] [--zcode-root <dir>]
                                       Copy zcode memories (~/.zcode/cli/memories/projects) into this store
```

## Migration from zcode / pi-zcode-memory

```bash
npx takka-memory import-zcode --dry-run   # preview
npx takka-memory import-zcode             # copy (non-destructive; identical files are skipped)
```

Memories land under the same project keys, so nothing changes semantically. The live zcode bridge is gone by design — takka-memory's store is its own, readable by any agent with file access.

## Memory file format

One fact per file, short kebab-case name, frontmatter with `name`, `description`, and `metadata.type`:

```markdown
---
name: prefer-ssh-git-remotes
description: User prefers SSH over HTTPS for git remotes on all machines
metadata:
  type: feedback
---

**Why:** HTTPS tokens expire and interrupt pushes.

**How to apply:** Convert new remotes to `git@github.com:...` form when noticed.
```

Memory types:

- `user` — who the user is
- `feedback` — guidance on how to work (include **Why:** and **How to apply:**)
- `project` — ongoing goals/constraints (include **Why:** / **How to apply:**)
- `reference` — URLs, dashboards, tickets

Link related memories with `[[name]]`. Use absolute dates.

## Configuration

| Environment variable | Effect |
|---|---|
| `TAKKA_MEMORY_ROOT` | Override the store root (defaults to `~/.takka/memory`) |
| `TAKKA_MEMORY_DISABLE=1` | Disable the pi extension (injection + tools) |

## Concurrency & durability

Writes are serialized per scope with a directory lock (`.lock`), and every file — the memory itself and the `MEMORY.md` index — is written atomically (temp file + rename). Two agents writing the same scope at the same time can no longer interleave into a torn index.

## Coexistence

pi's built-in private memory (`~/.pi/agent/memory`) is untouched — takka-memory is a separate, shareable store. Any other agent can read the markdown files directly; adapters just make it first-class.

## Development

```bash
npm install
npm test        # vitest — 62 tests across core, adapters, MCP, CLI
npm run build   # tsc → dist/
```

## License

[MIT](LICENSE)
