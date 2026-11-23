import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { deleteMemory, listMemories, readMemory, searchMemories, writeMemory } from "../core/store.js";
import { formatList, formatRead, formatSearch } from "../adapters/format.js";
import { VERSION } from "../version.js";

const scopeSchema = z.enum(["global", "project"]).optional();

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const errText = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true as const });

export function createMcpServer(cwd: string = process.cwd()): McpServer {
	const server = new McpServer({ name: "takka-memory", version: VERSION });

	server.registerTool(
		"memory_list",
		{
			description: "List persistent memories (both scopes, labeled [global]/[project]).",
			inputSchema: { scope: scopeSchema },
		},
		async ({ scope }) => text(formatList(listMemories(cwd, scope))),
	);

	server.registerTool(
		"memory_read",
		{
			description: "Read one full memory by name; without scope, project wins over global.",
			inputSchema: {
				name: z.string().describe("Memory name, e.g. 'ci-test-gotcha'"),
				scope: scopeSchema,
			},
		},
		async ({ name, scope }) => {
			const r = readMemory(cwd, name, scope);
			return r ? text(formatRead(r)) : errText(`No memory named '${name}'. Use memory_list first.`);
		},
	);

	server.registerTool(
		"memory_search",
		{
			description: "Case-insensitive text search across memory files (both scopes).",
			inputSchema: { query: z.string().describe("Text to search for"), scope: scopeSchema },
		},
		async ({ query, scope }) => text(formatSearch(searchMemories(cwd, query, scope), query)),
	);

	server.registerTool(
		"memory_write",
		{
			description:
				'Create/update one memory file + index. scope defaults to "project"; pass "global" for cross-project facts.',
			inputSchema: {
				name: z.string().describe("Short kebab-case slug, e.g. 'prefer-ssh-remotes'"),
				description: z.string().describe("One-line summary used for recall/index"),
				type: z.enum(["user", "feedback", "project", "reference"]).describe("Memory type"),
				body: z
					.string()
					.describe("Markdown body; feedback/project types should include **Why:** and **How to apply:**"),
				scope: scopeSchema,
				title: z.string().optional().describe("Display title for the index (defaults to name)"),
			},
		},
		async ({ name, description, type, body, scope, title }) => {
			const r = writeMemory(cwd, { name, description, type, body, scope, title });
			return text(`Saved memory '${r.name}' (${type}, ${r.scope} scope) — index updated.`);
		},
	);

	server.registerTool(
		"memory_delete",
		{
			description: "Delete one memory and remove its index line; without scope, project wins over global.",
			inputSchema: { name: z.string().describe("Memory name to delete"), scope: scopeSchema },
		},
		async ({ name, scope }) => {
			const r = deleteMemory(cwd, name, scope);
			return r
				? text(`Deleted '${r.file}' (${r.scope} scope) and removed its index line.`)
				: errText(`No memory named '${name}'.`);
		},
	);

	return server;
}

export async function runMcpServer(cwd: string = process.cwd()): Promise<void> {
	const server = createMcpServer(cwd);
	await server.connect(new StdioServerTransport());
}
