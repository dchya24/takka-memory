---
name: takka-memory
description: Recall and persist long-term memory via the takka-memory store (global + per-project scopes)
---

# takka-memory

Persistent markdown memory with two scopes: **global** (recalled in every project, `~/.takka/memory/`) and **project** (this workspace only, `~/.takka/memory/projects/<key>/`). Each scope has a `MEMORY.md` index; each memory is one markdown file with frontmatter (`name`, `description`, `metadata.type`).

## When to recall

- At session start, run `takka-memory list` (or the `memory_list` MCP tool) to load what's already remembered.
- Before answering questions about the user's preferences, past decisions, or project constraints, check memory via `memory_search`/`memory_read`.

## When to persist

Persist when the user says "remember this", or when you learn a durable fact:

- Preferences and working style (`type: feedback`) — include **Why:** and **How to apply:**.
- Identity/context about the user (`type: user`).
- Ongoing project goals/constraints (`type: project`) — include **Why:** / **How to apply:**.
- Useful links, dashboards, tickets (`type: reference`).

## Tools

`memory_list` · `memory_read` · `memory_search` · `memory_write` · `memory_delete` (MCP), or CLI equivalents: `takka-memory list|read|search`.

Scope rules:

- `memory_write` `scope` defaults to `"project"` — pass `"global"` explicitly only for facts that apply across all projects.
- `memory_read`/`memory_delete` resolve project first, then global.
- `memory_list`/`memory_search` merge both scopes with `[global]`/`[project]` labels.
- `memory_search` accepts an optional `limit` (1–200, default 40) to cap the number of hits.

## File format

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

One fact per file; short kebab-case name; one-line description for recall; link related memories with `[[name]]`; use absolute dates. Update an existing memory instead of creating a near-duplicate; `memory_delete` only for wrong/obsolete entries.
