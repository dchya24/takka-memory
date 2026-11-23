<!-- takka-memory -->
## Persistent memory (takka-memory)

At session start, run `npx takka-memory list` to load remembered facts (global + this project's scopes).

Persist durable preferences, decisions, and lessons with the takka-memory tools (MCP `memory_write`, or CLI):
- `scope` defaults to `"project"`; pass `"global"` explicitly only for facts that apply in every project.
- One fact per file, short kebab-case name, one-line `description` used for recall.
- `type`: `user` (who the user is), `feedback` (how to work; include **Why:** and **How to apply:**), `project` (goals/constraints), `reference` (URLs, tickets).
- When the user says "remember this", or you learn a durable preference/decision/lesson, persist it. Link related memories with `[[name]]`.
<!-- /takka-memory -->
