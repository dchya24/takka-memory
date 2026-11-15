// zcode-memory — bridge pi to zcode's file-based persistent memory.
//
// zcode keeps per-project memories as plain markdown under:
//   ~/.zcode/cli/memories/projects/<project-key>/memory/
//     MEMORY.md        — index, one line per memory: `- [Title](file.md) — hook`
//     <slug>.md        — one fact per file, frontmatter: name/description/metadata.type
//
// project-key = `<basename(cwd)>-<first 16 hex of sha256(cwd)>`, e.g.
//   ~/.pi -> .pi-38f13a76d1eebaea
// Because both agents derive the same key from the same workspace root, pi and
// zcode read/write the SAME store: memories written here are recalled by zcode
// on its next session, and vice versa.
//
// What this extension does:
//   - Injects the memory index into the system prompt every turn
//     (before_agent_start) when the project has a zcode memory dir.
//   - Registers tools: zcode_memory_list / _read / _search / _write / _delete.
//
// Coexists with pi's built-in memory (~/.pi/agent/memory stays pi-private).
//
// Env:
//   ZCODE_MEMORY_DISABLE=1   turn everything off
//   ZCODE_MEMORIES_ROOT      override ~/.zcode/cli/memories/projects

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

let MEMORIES_ROOT = path.join(os.homedir(), ".zcode", "cli", "memories", "projects");

/** Override the memories root (for testing). */
export function _setMemoriesRoot(root: string) {
	MEMORIES_ROOT = root;
}

export function memoriesRoot(): string {
	return process.env.ZCODE_MEMORIES_ROOT || MEMORIES_ROOT;
}

/** zcode project key: `<basename>-<sha256(cwd)[0..16]>` (matches zcode's layout). */
export function projectKeyFor(cwd: string): string {
	const base = path.basename(cwd);
	const hash = crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 16);
	return `${base}-${hash}`;
}

export function memoryDirFor(cwd: string): string {
	return path.join(memoriesRoot(), projectKeyFor(cwd), "memory");
}

function indexFile(dir: string): string {
	return path.join(dir, "MEMORY.md");
}

// ---------------------------------------------------------------------------
// Index + frontmatter parsing
// ---------------------------------------------------------------------------

interface IndexEntry {
	title: string;
	file: string;
	hook: string;
	line: string;
}

/** Parse `- [Title](file.md) — hook` lines out of a MEMORY.md index. */
export function parseIndex(md: string): IndexEntry[] {
	const entries: IndexEntry[] = [];
	for (const line of md.split("\n")) {
		const m = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)\s*[—–-]\s*(.*)$/.exec(line);
		if (m) entries.push({ title: m[1].trim(), file: m[2].trim(), hook: m[3].trim(), line });
	}
	return entries;
}

/** Extract `description:` and `type:` from a memory file's frontmatter. */
export function parseFrontmatter(md: string): { description: string; type: string } {
	const result = { description: "", type: "" };
	const m = /^---\n([\s\S]*?)\n---/.exec(md);
	if (!m) return result;
	for (const line of m[1].split("\n")) {
		let dm = /^description:\s*(.+)$/.exec(line);
		if (dm) result.description = dm[1].trim();
		dm = /^\s*type:\s*(\S+)/.exec(line);
		if (dm) result.type = dm[1].trim();
	}
	return result;
}

function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/\.md$/, "")
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "memory";
}

/** Resolve a user-supplied name to a file inside dir (rejects traversal). */
function resolveMemoryFile(dir: string, name: string): string | null {
	const candidates = [name, `${name}.md`, slugify(name), `${slugify(name)}.md`];
	for (const c of candidates) {
		const p = path.resolve(dir, c);
		if (p.startsWith(path.resolve(dir) + path.sep) && fs.existsSync(p) && fs.statSync(p).isFile()) {
			return p;
		}
	}
	return null;
}

function readIndexEntries(dir: string): { md: string; entries: IndexEntry[] } | null {
	const md = readFileSafe(indexFile(dir));
	if (md === null) return null;
	return { md, entries: parseIndex(md) };
}

function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Index maintenance
// ---------------------------------------------------------------------------

function upsertIndexLine(dir: string, file: string, title: string, hook: string) {
	const filePath = indexFile(dir);
	let md = readFileSafe(filePath);
	if (md === null) {
		md = "# Memory Index\n";
	}
	const oneLineHook = hook.replace(/\s*\n\s*/g, " ").trim();
	const newLine = `- [${title}](${file}) — ${oneLineHook}`;
	const entries = parseIndex(md);
	let replaced = false;
	const lines = md.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const m = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)/.exec(lines[i]);
		if (m && m[2].trim() === file) {
			lines[i] = newLine;
			replaced = true;
			break;
		}
	}
	if (!replaced) {
		if (!md.endsWith("\n")) md += "\n";
		fs.writeFileSync(filePath, md + newLine + "\n", "utf-8");
	} else {
		fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
	}
}

function removeFromIndex(dir: string, file: string) {
	const md = readFileSafe(indexFile(dir));
	if (md === null) return;
	const lines = md.split("\n").filter((l) => {
		const m = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)/.exec(l);
		return !(m && m[2].trim() === file);
	});
	fs.writeFileSync(indexFile(dir), lines.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// Context injection
// ---------------------------------------------------------------------------

const MAX_INDEX_CHARS = 8000;

function buildContextBlock(dir: string): string | null {
	const index = readIndexEntries(dir);
	if (!index || !index.entries.length) return null;
	let indexMd = index.md.trim();
	if (indexMd.length > MAX_INDEX_CHARS) indexMd = indexMd.slice(0, MAX_INDEX_CHARS) + "\n… (truncated)";
	return [
		"",
		"## Shared Memory (zcode)",
		"",
		"This project shares persistent memory with the zcode agent — the files below are",
		"read by BOTH agents (pi and zcode) at session start, so writes here are recalled everywhere.",
		"",
		"### Memory index",
		"",
		indexMd,
		"",
		"Tools: `zcode_memory_list`, `zcode_memory_read`, `zcode_memory_search`, `zcode_memory_write`, `zcode_memory_delete`.",
		"Format: one markdown file per fact with frontmatter (`name`, `description`, `metadata.type`: user | feedback | project | reference).",
		"`feedback`/`project` entries should include **Why:** and **How to apply:** lines; link related memories with [[name]].",
		'If someone says "remember this", or you learn a durable preference/decision/lesson, persist it with `zcode_memory_write`.',
		"",
	].join("\n");
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function zcodeMemoryExtension(pi: ExtensionAPI) {
	if (process.env.ZCODE_MEMORY_DISABLE === "1") return;

	const dir = () => memoryDirFor(process.cwd());

	pi.on("before_agent_start", async (_event, _ctx) => {
		const block = buildContextBlock(dir());
		if (!block) return;
		return { systemPrompt: _event.systemPrompt + block };
	});

	const listMemories = () => {
		const d = dir();
		if (!fs.existsSync(d)) return "No zcode memory for this project yet (nothing written by zcode or pi here).";
		const files = fs.readdirSync(d).filter((f) => f.endsWith(".md") && f !== "MEMORY.md");
		if (!files.length) return "No zcode memory files for this project yet.";
		const rows = files.map((f) => {
			const raw = readFileSafe(path.join(d, f)) ?? "";
			const fm = parseFrontmatter(raw);
			return `- ${f.replace(/\.md$/, "")} [${fm.type || "?"}] ${fm.description || "(no description)"}`;
		});
		return `zcode memory for project key ${projectKeyFor(process.cwd())}:\n${rows.join("\n")}`;
	};

	pi.registerTool({
		name: "zcode_memory_list",
		label: "Zcode Memory List",
		description:
			"List all shared-memory files this project shares with the zcode agent, with their type and description.",
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: listMemories() }] };
		},
	});

	pi.registerTool({
		name: "zcode_memory_read",
		label: "Zcode Memory Read",
		description: "Read one full shared memory file by name (slug, with or without .md).",
		parameters: Type.Object({
			name: Type.String({ description: "Memory name, e.g. 'pi-setup-configuration'" }),
		}),
		async execute(_id, params) {
			const p = resolveMemoryFile(dir(), params.name);
			if (!p) {
				return {
					content: [{ type: "text", text: `No memory named '${params.name}'. Use zcode_memory_list first.` }],
					isError: true,
				};
			}
			return { content: [{ type: "text", text: readFileSafe(p) ?? "" }] };
		},
	});

	pi.registerTool({
		name: "zcode_memory_search",
		label: "Zcode Memory Search",
		description: "Case-insensitive text search across all shared memory files. Returns file, line number, and matching line.",
		parameters: Type.Object({
			query: Type.String({ description: "Text to search for" }),
		}),
		async execute(_id, params) {
			const d = dir();
			const q = params.query.toLowerCase();
			if (!q.trim() || !fs.existsSync(d)) {
				return { content: [{ type: "text", text: "No matches (or no memory dir yet)." }] };
			}
			const hits: string[] = [];
			const files = ["MEMORY.md", ...fs.readdirSync(d).filter((f) => f.endsWith(".md") && f !== "MEMORY.md")];
			for (const f of files) {
				const raw = readFileSafe(path.join(d, f)) ?? "";
				raw.split("\n").forEach((line, i) => {
					if (hits.length < 40 && line.toLowerCase().includes(q)) {
						hits.push(`${f}:${i + 1}: ${line.trim()}`);
					}
				});
			}
			return {
				content: [
					{
						type: "text",
						text: hits.length ? hits.join("\n") : `No matches for '${params.query}'.`,
					},
				],
			};
		},
	});

	pi.registerTool({
		name: "zcode_memory_write",
		label: "Zcode Memory Write",
		description: [
			"Create or update one shared memory file (visible to BOTH pi and zcode in this project).",
			"One fact per file. Use a short kebab-case name; update an existing memory instead of creating a near-duplicate.",
			"description = one-line summary used for recall. type: user (who the user is), feedback (guidance on how to work; include **Why:** and **How to apply:**), project (ongoing goals/constraints; include **Why:**/**How to apply:**), reference (URLs, dashboards, tickets).",
			"Link related memories in the body with [[name]]. Convert relative dates to absolute.",
		].join("\n"),
		parameters: Type.Object({
			name: Type.String({ description: "Short kebab-case slug, e.g. 'glid-ci-test-gotcha'" }),
			description: Type.String({ description: "One-line summary for the index/recall" }),
			type: StringEnum(["user", "feedback", "project", "reference"] as const, {
				description: "Memory type",
			}),
			body: Type.String({ description: "Markdown body of the memory" }),
			title: Type.Optional(
				Type.String({ description: "Display title for the index (defaults to name)" }),
			),
		}),
		async execute(_id, params) {
			const d = dir();
			fs.mkdirSync(d, { recursive: true });
			const slug = slugify(params.name);
			const file = `${slug}.md`;
			const fm = [
				"---",
				`name: ${slug}`,
				`description: ${params.description.replace(/\s*\n\s*/g, " ").trim()}`,
				"metadata:",
				`  type: ${params.type}`,
				"---",
				"",
				params.body.trim(),
				"",
			].join("\n");
			fs.writeFileSync(path.join(d, file), fm, "utf-8");
			upsertIndexLine(d, file, params.title?.trim() || slug, params.description);
			return {
				content: [
					{
						type: "text",
						text: `Saved shared memory '${slug}' (${params.type}) in ${d} — index updated. zcode will load it on its next session in this project.`,
					},
				],
			};
		},
	});

	pi.registerTool({
		name: "zcode_memory_delete",
		label: "Zcode Memory Delete",
		description: "Delete one shared memory file and remove it from the index. Only for memories that are wrong or obsolete.",
		parameters: Type.Object({
			name: Type.String({ description: "Memory name to delete" }),
		}),
		async execute(_id, params) {
			const d = dir();
			const p = resolveMemoryFile(d, params.name);
			if (!p) {
				return {
					content: [{ type: "text", text: `No memory named '${params.name}'.` }],
					isError: true,
				};
			}
			const file = path.basename(p);
			fs.rmSync(p);
			removeFromIndex(d, file);
			return {
				content: [{ type: "text", text: `Deleted '${file}' and removed its index line.` }],
			};
		},
	});
}
