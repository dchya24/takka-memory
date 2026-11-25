import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryType } from "./frontmatter.js";
import { buildMemoryFile, parseFrontmatter, slugify } from "./frontmatter.js";
import { parseIndex, removeFromIndexLocked, upsertIndexLineLocked } from "./index-md.js";
import { atomicWriteFileSync, readFileSafe, withDirLockSync } from "./fsutil.js";
import { scopeDir, type Scope } from "./paths.js";

export interface MemoryInfo {
	name: string;
	scope: Scope;
	type: string;
	description: string;
}
export interface SearchResult {
	scope: Scope;
	file: string;
	line: number;
	text: string;
}
export interface ReadResult {
	scope: Scope;
	path: string;
	content: string;
}
export interface WriteInput {
	name: string;
	description: string;
	type: MemoryType;
	body: string;
	scope?: Scope;
	title?: string;
}
export interface WriteResult {
	name: string;
	scope: Scope;
	file: string;
}
export interface DeleteResult {
	scope: Scope;
	file: string;
}

const INDEX_FILE = "MEMORY.md";
const SEARCH_CAP = 40;

function memoryFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".md") && f !== INDEX_FILE)
		.sort();
}

/** Selected scopes in resolution order: project first, then global. */
function scopesSelected(cwd: string, scope?: Scope): { scope: Scope; dir: string }[] {
	if (scope) return [{ scope, dir: scopeDir(scope, cwd) }];
	return [
		{ scope: "project", dir: scopeDir("project", cwd) },
		{ scope: "global", dir: scopeDir("global", cwd) },
	];
}

export function listMemories(cwd: string, scope?: Scope): MemoryInfo[] {
	const infos: MemoryInfo[] = [];
	for (const { scope: s, dir } of scopesSelected(cwd, scope)) {
		for (const f of memoryFiles(dir)) {
			const fm = parseFrontmatter(readFileSafe(path.join(dir, f)) ?? "");
			infos.push({ name: f.replace(/\.md$/, ""), scope: s, type: fm.type, description: fm.description });
		}
	}
	return infos;
}

export function searchMemories(
	cwd: string,
	query: string,
	scope?: Scope,
	opts?: { limit?: number; signal?: AbortSignal },
): SearchResult[] {
	const q = query.toLowerCase().trim();
	const hits: SearchResult[] = [];
	if (!q) return hits;
	const limit = opts?.limit ?? SEARCH_CAP;
	for (const { scope: s, dir } of scopesSelected(cwd, scope)) {
		const files = fs.existsSync(dir) ? [INDEX_FILE, ...memoryFiles(dir)] : [];
		for (const f of files) {
			if (opts?.signal?.aborted) return hits;
			const raw = readFileSafe(path.join(dir, f)) ?? "";
			const lines = raw.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (hits.length >= limit) return hits;
				if (lines[i].toLowerCase().includes(q)) {
					hits.push({ scope: s, file: f, line: i + 1, text: lines[i].trim() });
				}
			}
		}
	}
	return hits;
}

/** Traversal-safe name → file resolution inside dir. */
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

export function readMemory(cwd: string, name: string, scope?: Scope): ReadResult | null {
	for (const { scope: s, dir } of scopesSelected(cwd, scope)) {
		const p = resolveMemoryFile(dir, name);
		if (p) return { scope: s, path: p, content: readFileSafe(p) ?? "" };
	}
	return null;
}

export function writeMemory(cwd: string, input: WriteInput): WriteResult {
	const scope: Scope = input.scope ?? "project";
	const dir = scopeDir(scope, cwd);
	fs.mkdirSync(dir, { recursive: true });
	const slug = slugify(input.name);
	const file = `${slug}.md`;
	// Same lock as the index update, so concurrent writers can't interleave file+index.
	withDirLockSync(dir, () => {
		atomicWriteFileSync(path.join(dir, file), buildMemoryFile(input));
		upsertIndexLineLocked(dir, file, input.title?.trim() || slug, input.description);
	});
	return { name: slug, scope, file };
}

export function deleteMemory(cwd: string, name: string, scope?: Scope): DeleteResult | null {
	for (const { scope: s, dir } of scopesSelected(cwd, scope)) {
		const p = resolveMemoryFile(dir, name);
		if (p) {
			const file = path.basename(p);
			// Locked so a concurrent write can't recreate the index line after we remove it.
			withDirLockSync(dir, () => {
				fs.rmSync(p);
				removeFromIndexLocked(dir, file);
			});
			return { scope: s, file };
		}
	}
	return null;
}

/** Trimmed MEMORY.md of a scope, or null when missing/empty (no entries). */
export function readIndexMd(scope: Scope, cwd: string): string | null {
	const dir = scopeDir(scope, cwd);
	const md = readFileSafe(path.join(dir, INDEX_FILE));
	if (md === null || !parseIndex(md).length) return null;
	return md.trim();
}
