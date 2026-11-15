# @dchya24/pi-zcode-memory

A [pi](https://pi.dev) extension that shares **zcode's** file-based persistent memory between the two coding agents.

When pi and zcode are launched in the same project, this extension wires pi to the exact memory store zcode reads and writes — so a preference zcode learned last week is recalled by pi today, and anything pi saves is loaded by zcode on its next session. No server, no database: memories are plain markdown files.

## How it works

zcode keeps per-project memories as markdown under:

```
~/.zcode/cli/memories/projects/<project-key>/memory/
├── MEMORY.md      # index — one line per memory: `- [Title](file.md) — hook`
└── <slug>.md      # one fact per file, with frontmatter
```

The project key is `<basename(cwd)>-<first 16 hex chars of sha256(cwd)>`, e.g. `~/.pi` → `.pi-38f13a76d1eebaea`. Because both agents derive the same key from the same workspace root, they read and write the **same store**.

The extension:

- **Injects the memory index into pi's system prompt** every turn (via `before_agent_start`) when the project has a zcode memory dir, so pi knows what's already remembered.
- **Registers five tools** so the agent can manage memories on demand:

| Tool | Purpose |
|---|---|
| `zcode_memory_list` | List all shared memories with type and description |
| `zcode_memory_read` | Read one full memory file by name |
| `zcode_memory_search` | Case-insensitive text search across all memories |
| `zcode_memory_write` | Create or update one memory (auto-maintains the index) |
| `zcode_memory_delete` | Delete a memory and remove its index line |

## Requirements

- [pi](https://pi.dev)
- zcode with its CLI memory store at `~/.zcode/cli/memories/projects` — install this extension only if you run **both** agents in the same projects; otherwise there is nothing to share with.

## Install

From git:

```bash
pi install git:github.com/dchya24/pi-zcode-memory
```

From npm (planned):

```bash
pi install npm:@dchya24/pi-zcode-memory
```

From a local checkout:

```bash
pi install ./pi-zcode-memory
```

## Configuration

| Environment variable | Effect |
|---|---|
| `ZCODE_MEMORY_DISABLE=1` | Turn the extension completely off |
| `ZCODE_MEMORIES_ROOT` | Override the memories root (defaults to `~/.zcode/cli/memories/projects`) |

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

Link related memories in the body with `[[name]]`.

## Coexistence

This extension does **not** touch pi's built-in memory: `~/.pi/agent/memory` stays pi-private. The zcode store is shared territory; pi's own store is not.

## License

[MIT](LICENSE)
