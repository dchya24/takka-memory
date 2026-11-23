// takka-memory pi adapter — system-prompt injection + native memory_* tools.
// Deprecated aliases zcode_memory_* map to the same handlers until the next major.
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { deleteMemory, listMemories, readIndexMd, readMemory, searchMemories, writeMemory } from "../core/store.js";
import type { MemoryType } from "../core/frontmatter.js";
import { formatList, formatRead, formatSearch } from "./format.js";

const MAX_INDEX_CHARS = 8000;

type ToolResult = {
	content: [{ type: "text"; text: string }];
	details: undefined;
	isError?: boolean;
};
const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }], details: undefined });
const err = (text: string): ToolResult => ({ content: [{ type: "text", text }], details: undefined, isError: true });

export function buildInjection(cwd: string): string | null {
	const g = readIndexMd("global", cwd);
	const p = readIndexMd("project", cwd);
	if (!g && !p) return null;
	const trim = (md: string) => (md.length > MAX_INDEX_CHARS ? md.slice(0, MAX_INDEX_CHARS) + "\n… (truncated)" : md);
	const lines = [
		"",
		"## Takka Memory (persistent memory)",
		"",
		"Persistent markdown memory with two scopes: `global` (recalled in every project) and `project` (this workspace only).",
		"The indexes below are loaded at session start; manage entries with the `memory_*` tools.",
		'`memory_write` scope defaults to "project"; pass scope:"global" only for facts that apply across all projects.',
		"Format: one markdown file per fact with frontmatter (name, description, metadata.type: user | feedback | project | reference).",
		"`feedback`/`project` entries should include **Why:** and **How to apply:**; link related memories with [[name]]; use absolute dates.",
		'Persist durable preferences, decisions, and lessons — e.g. when the user says "remember this" — with `memory_write`.',
		"",
	];
	if (g) lines.push("### Global memories", "", trim(g), "");
	if (p) lines.push("### Project memories", "", trim(p), "");
	return lines.join("\n");
}

export function makeHandlers(cwd: string) {
	type Scope = "global" | "project";
	return {
		list: async (_params: { scope?: Scope }) => ok(formatList(listMemories(cwd, _params.scope))),
		read: async (params: { name: string; scope?: Scope }) => {
			const r = readMemory(cwd, params.name, params.scope);
			return r ? ok(formatRead(r)) : err(`No memory named '${params.name}'. Use memory_list first.`);
		},
		search: async (params: { query: string; scope?: Scope }) =>
			ok(formatSearch(searchMemories(cwd, params.query, params.scope), params.query)),
		write: async (params: {
			name: string;
			description: string;
			type: MemoryType;
			body: string;
			scope?: Scope;
			title?: string;
		}) => {
			const r = writeMemory(cwd, params);
			return ok(`Saved memory '${r.name}' (${params.type}, ${r.scope} scope) — index updated.`);
		},
		delete: async (params: { name: string; scope?: Scope }) => {
			const r = deleteMemory(cwd, params.name, params.scope);
			return r
				? ok(`Deleted '${r.file}' (${r.scope} scope) and removed its index line.`)
				: err(`No memory named '${params.name}'.`);
		},
	};
}

export default function takkaMemoryExtension(pi: ExtensionAPI): void {
	if (process.env.TAKKA_MEMORY_DISABLE === "1") return;
	const cwd = process.cwd();
	const handlers = makeHandlers(cwd);

	pi.on("before_agent_start", async (event) => {
		const block = buildInjection(cwd);
		if (!block) return;
		return { systemPrompt: event.systemPrompt + block };
	});

	const SCOPE = Type.Optional(
		StringEnum(["global", "project"] as const, {
			description: 'Memory scope. Defaults to "project"; pass "global" for cross-project facts.',
		}),
	);
	const WRITE_PARAMS = Type.Object({
		name: Type.String({ description: "Short kebab-case slug, e.g. 'prefer-ssh-remotes'" }),
		description: Type.String({ description: "One-line summary used for recall/index" }),
		type: StringEnum(["user", "feedback", "project", "reference"] as const, { description: "Memory type" }),
		body: Type.String({
			description: "Markdown body; feedback/project entries should include **Why:** and **How to apply:**",
		}),
		scope: SCOPE,
		title: Type.Optional(Type.String({ description: "Display title for the index (defaults to name)" })),
	});

	pi.registerTool({
		name: "memory_list",
		label: "Memory List",
		description: "List persistent memories (both scopes, labeled [global]/[project]).",
		parameters: Type.Object({ scope: SCOPE }),
		async execute(_id, params) {
			return handlers.list(params);
		},
	});
	pi.registerTool({
		name: "memory_read",
		label: "Memory Read",
		description: "Read one full memory by name; without scope, project wins over global.",
		parameters: Type.Object({ name: Type.String({ description: "Memory name, e.g. 'ci-test-gotcha'" }), scope: SCOPE }),
		async execute(_id, params) {
			return handlers.read(params);
		},
	});
	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description: "Case-insensitive text search across memory files (both scopes).",
		parameters: Type.Object({ query: Type.String({ description: "Text to search for" }), scope: SCOPE }),
		async execute(_id, params) {
			return handlers.search(params);
		},
	});
	pi.registerTool({
		name: "memory_write",
		label: "Memory Write",
		description: 'Create/update one memory file + index. scope defaults to "project"; pass "global" for cross-project facts.',
		parameters: WRITE_PARAMS,
		async execute(_id, params) {
			return handlers.write(params);
		},
	});
	pi.registerTool({
		name: "memory_delete",
		label: "Memory Delete",
		description: "Delete one memory and remove its index line; without scope, project wins over global.",
		parameters: Type.Object({ name: Type.String({ description: "Memory name to delete" }), scope: SCOPE }),
		async execute(_id, params) {
			return handlers.delete(params);
		},
	});

	// Deprecated aliases (same handlers, deprecation note appended) — remove in next major.
	const alias = async (run: () => Promise<ToolResult>, verb: string): Promise<ToolResult> => {
		const r = await run();
		r.content[0].text += `\n\n(deprecated alias — use memory_${verb})`;
		return r;
	};
	pi.registerTool({
		name: "zcode_memory_list",
		label: "Zcode Memory List (deprecated)",
		description: "Deprecated alias of memory_list.",
		parameters: Type.Object({ scope: SCOPE }),
		async execute(_id, params) {
			return alias(() => handlers.list(params), "list");
		},
	});
	pi.registerTool({
		name: "zcode_memory_read",
		label: "Zcode Memory Read (deprecated)",
		description: "Deprecated alias of memory_read.",
		parameters: Type.Object({ name: Type.String(), scope: SCOPE }),
		async execute(_id, params) {
			return alias(() => handlers.read(params), "read");
		},
	});
	pi.registerTool({
		name: "zcode_memory_search",
		label: "Zcode Memory Search (deprecated)",
		description: "Deprecated alias of memory_search.",
		parameters: Type.Object({ query: Type.String(), scope: SCOPE }),
		async execute(_id, params) {
			return alias(() => handlers.search(params), "search");
		},
	});
	pi.registerTool({
		name: "zcode_memory_write",
		label: "Zcode Memory Write (deprecated)",
		description: "Deprecated alias of memory_write.",
		parameters: WRITE_PARAMS,
		async execute(_id, params) {
			return alias(() => handlers.write(params), "write");
		},
	});
	pi.registerTool({
		name: "zcode_memory_delete",
		label: "Zcode Memory Delete (deprecated)",
		description: "Deprecated alias of memory_delete.",
		parameters: Type.Object({ name: Type.String(), scope: SCOPE }),
		async execute(_id, params) {
			return alias(() => handlers.delete(params), "delete");
		},
	});
}
