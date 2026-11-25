// takka-memory pi adapter — system-prompt injection + native memory_* tools.
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
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

/** Resolve the working directory to use for a request: fixed string or dynamic resolver. */
export type CwdResolver = string | (() => string);

export function makeHandlers(resolveCwd: CwdResolver) {
	type Scope = "global" | "project";
	const cwd = () => (typeof resolveCwd === "function" ? resolveCwd() : resolveCwd);
	return {
		list: async (_params: { scope?: Scope }) => ok(formatList(listMemories(cwd(), _params.scope))),
		read: async (params: { name: string; scope?: Scope }) => {
			const r = readMemory(cwd(), params.name, params.scope);
			return r ? ok(formatRead(r)) : err(`No memory named '${params.name}'. Use memory_list first.`);
		},
		search: async (params: { query: string; scope?: Scope; limit?: number }) =>
			ok(formatSearch(searchMemories(cwd(), params.query, params.scope, { limit: params.limit }), params.query)),
		write: async (params: {
			name: string;
			description: string;
			type: MemoryType;
			body: string;
			scope?: Scope;
			title?: string;
		}) => {
			const r = writeMemory(cwd(), params);
			return ok(`Saved memory '${r.name}' (${params.type}, ${r.scope} scope) — index updated.`);
		},
		delete: async (params: { name: string; scope?: Scope }) => {
			const r = deleteMemory(cwd(), params.name, params.scope);
			return r
				? ok(`Deleted '${r.file}' (${r.scope} scope) and removed its index line.`)
				: err(`No memory named '${params.name}'.`);
		},
	};
}

/** Session cwd, resolved per request so workspace switches mid-session stay correct. */
function requestCwd(ctx?: Pick<ExtensionToolContext, "cwd">): string {
	return ctx?.cwd ?? process.cwd();
}

export default function takkaMemoryExtension(pi: ExtensionAPI): void {
	if (process.env.TAKKA_MEMORY_DISABLE === "1") return;

	pi.on("before_agent_start", async (event, ctx) => {
		const block = buildInjection(requestCwd(ctx));
		if (!block) return;
		return { systemPrompt: event.systemPrompt + block };
	});

	const SCOPE = Type.Optional(
		StringEnum(["global", "project"] as const, {
			description: 'Memory scope. Defaults to "project"; pass "global" for cross-project facts.',
		}),
	);
	const LIMIT = Type.Optional(
		Type.Number({ description: "Max hits (default 40, 1-200).", minimum: 1, maximum: 200 }),
	);
	const WRITE_PARAMS = Type.Object({
		name: Type.String({ description: "Short kebab-case slug, e.g. 'prefer-ssh-remotes'" }),
		description: Type.String({ description: "One-line summary used for recall/index" }),
		type: StringEnum(["user", "feedback", "project", "reference"] as const, { description: "Memory type" }),
		body: Type.String({
			description: "Markdown body; feedback/project types should include **Why:** and **How to apply:**",
		}),
		scope: SCOPE,
		title: Type.Optional(Type.String({ description: "Display title for the index (defaults to name)" })),
	});

	pi.registerTool({
		name: "memory_list",
		label: "Memory List",
		description: "List persistent memories (both scopes, labeled [global]/[project]).",
		parameters: Type.Object({ scope: SCOPE }),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			return makeHandlers(() => requestCwd(ctx)).list(params);
		},
	});
	pi.registerTool({
		name: "memory_read",
		label: "Memory Read",
		description: "Read one full memory by name; without scope, project wins over global.",
		parameters: Type.Object({ name: Type.String({ description: "Memory name, e.g. 'ci-test-gotcha'" }), scope: SCOPE }),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			return makeHandlers(() => requestCwd(ctx)).read(params);
		},
	});
	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description: "Case-insensitive text search across memory files (both scopes).",
		parameters: Type.Object({
			query: Type.String({ description: "Text to search for" }),
			scope: SCOPE,
			limit: LIMIT,
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			return makeHandlers(() => requestCwd(ctx)).search(params);
		},
	});
	pi.registerTool({
		name: "memory_write",
		label: "Memory Write",
		description: 'Create/update one memory file + index. scope defaults to "project"; pass "global" for cross-project facts.',
		parameters: WRITE_PARAMS,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			return makeHandlers(() => requestCwd(ctx)).write(params);
		},
	});
	pi.registerTool({
		name: "memory_delete",
		label: "Memory Delete",
		description: "Delete one memory and remove its index line; without scope, project wins over global.",
		parameters: Type.Object({ name: Type.String({ description: "Memory name to delete" }), scope: SCOPE }),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			return makeHandlers(() => requestCwd(ctx)).delete(params);
		},
	});
}
