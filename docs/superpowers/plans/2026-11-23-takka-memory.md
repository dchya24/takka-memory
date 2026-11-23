# takka-memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the zcode-coupled pi extension with `takka-memory` — a standalone, agent-agnostic persistent memory (global + per-project markdown store) shipped as one package with a pi adapter, an MCP server, and a CLI.

**Architecture:** Pure-TS core engine (`src/core`) with zero harness deps; three surfaces over it: pi extension (prompt injection + native tools + deprecated `zcode_memory_*` aliases), MCP stdio server (`npx takka-memory mcp`), CLI (`list/read/search/path/import-zcode`). Spec: `docs/superpowers/specs/2026-11-23-takka-memory-design.md`.

**Tech Stack:** TypeScript (NodeNext ESM), vitest, `@modelcontextprotocol/sdk` + `zod`, `tsc` build to `dist/`.

## Global Constraints

- Package name `takka-memory`, version `0.2.0`, license MIT, author `dchya24`.
- Store root: `~/.takka/memory/` (env `TAKKA_MEMORY_ROOT`); project dir `<root>/projects/<basename>-<sha256(cwd)[0..16]>` (zcode-compatible key, unchanged).
- Scope rules: `write` scope defaults to `"project"`; `global` only when explicitly passed. `read`/`delete` fallback project → global when no scope given. `list`/`search` merge both scopes, labeled `[global]`/`[project]`.
- No live zcode bridge (dropped). Only `import-zcode` one-shot copy (non-destructive; identical→skip, missing→copy, differing→overwrite).
- Deprecated aliases `zcode_memory_list/read/search/write/delete` stay until next major; responses append `(deprecated alias — use memory_<verb>)`.
- Env: `TAKKA_MEMORY_DISABLE=1` disables the pi adapter only. Old `ZCODE_*` env vars removed.
- Memory file format unchanged: frontmatter `name/description/metadata.type`, types `user|feedback|project|reference`, index line `- [Title](file.md) — hook`, index header `# Memory Index`.
- Traversal guard: name resolution candidates confined inside the scope dir.
- Everything compiles with `tsc -p tsconfig.json` → `dist/` (strict, NodeNext, ES2022). pi entry is plain JS re-exporting `dist/adapters/pi.js` (no TS-loader assumptions).
- Commit after every task. Tests run with `npm test` (vitest).

## File Structure

```
package.json                    # rewrite (name/bin/scripts/deps)
tsconfig.json                   # new (strict NodeNext build)
bin/takka-memory.js             # new shebang → dist/cli.js
extensions/takka-memory.js      # new pi entry (re-export dist) — replaces zcode-memory.ts
src/version.ts                  # VERSION const
src/core/paths.ts               # root, project key, scope dirs
src/core/fsutil.ts              # readFileSafe
src/core/frontmatter.ts         # slugify, parse/build frontmatter
src/core/index-md.ts            # parse/upsert/remove index lines
src/core/store.ts               # list/search/read/write/delete + readIndexMd
src/core/import-zcode.ts        # migration copy logic
src/adapters/format.ts          # shared tool-output formatting
src/adapters/pi.ts              # injection + handlers + registerTool wiring
src/mcp/server.ts               # MCP stdio server
src/cli.ts                      # CLI main()
tests/*.test.ts                 # vitest per core unit + adapters + mcp + cli
integrations/claude-code/       # CLAUDE.md snippet + skill markdown
README.md, CHANGELOG.md         # rewritten
deleted: extensions/zcode-memory.ts
```

---

### Task 1: Package scaffold & build tooling

**Files:** Modify `package.json`, `.gitignore`; Create `tsconfig.json`, `bin/takka-memory.js`, `src/version.ts`, `src/cli.ts` (stub), `extensions/takka-memory.js`; Delete `extensions/zcode-memory.ts`.

**Interfaces:** Produces build/test scripts (`npm run build`, `npm test`), `VERSION` export, CLI stub with `main(argv)`.

- [ ] **Step 1:** Rewrite `package.json` (see code below), create `tsconfig.json`, `bin/takka-memory.js`, `extensions/takka-memory.js`, stub `src/cli.ts`, `src/version.ts`; `git rm extensions/zcode-memory.ts`; add `dist/` + `node_modules/` to `.gitignore`.

`package.json`:
```json
{
	"name": "takka-memory",
	"version": "0.2.0",
	"description": "Agent-agnostic persistent memory: global + per-project markdown store for pi, Claude Code (MCP), and any MCP-capable harness",
	"type": "module",
	"keywords": ["pi-package", "pi-coding-agent", "mcp", "memory", "persistent-memory", "claude-code", "zcode"],
	"license": "MIT",
	"author": "dchya24",
	"repository": { "type": "git", "url": "git+https://github.com/dchya24/pi-zcode-memory.git" },
	"bin": { "takka-memory": "bin/takka-memory.js" },
	"files": ["bin", "dist", "extensions", "integrations", "README.md", "CHANGELOG.md", "LICENSE"],
	"scripts": {
		"build": "tsc -p tsconfig.json",
		"test": "vitest run",
		"prepack": "npm run build"
	},
	"engines": { "node": ">=18" },
	"dependencies": { "@modelcontextprotocol/sdk": "^1.17.0", "zod": "^3.25.0" },
	"peerDependencies": { "@earendil-works/pi-ai": "*", "@earendil-works/pi-coding-agent": "*" },
	"peerDependenciesMeta": { "@earendil-works/pi-ai": { "optional": true }, "@earendil-works/pi-coding-agent": { "optional": true } },
	"devDependencies": {
		"@earendil-works/pi-ai": "*",
		"@earendil-works/pi-coding-agent": "*",
		"@types/node": "^22",
		"typescript": "^5.6.0",
		"vitest": "^3.0.0"
	}
}
```

`tsconfig.json`:
```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"outDir": "dist",
		"rootDir": "src",
		"declaration": false,
		"sourceMap": false
	},
	"include": ["src"]
}
```

`bin/takka-memory.js`:
```js
#!/usr/bin/env node
import { main } from "../dist/cli.js";
main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
```

`extensions/takka-memory.js`:
```js
import takkaMemory from "../dist/adapters/pi.js";
export default takkaMemory;
```

`src/version.ts`:
```ts
export const VERSION = "0.2.0";
```

`src/cli.ts` (stub, replaced in Task 8):
```ts
export async function main(_argv: string[]): Promise<number> {
	console.log("takka-memory CLI — not implemented yet");
	return 1;
}
```

- [ ] **Step 2:** `npm install` (registry must serve `@modelcontextprotocol/sdk`, `zod`, `vitest`, `typescript`, `@types/node`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`). Contingency: if a pi package is missing from npm, install it from pi's global install dir via `file:` in devDependencies only (never publish that form; remove before `prepack` if needed).
- [ ] **Step 3:** `chmod +x bin/takka-memory.js && npm run build` → expect `dist/cli.js`, `dist/version.js`. `node bin/takka-memory.js` prints the stub line.
- [ ] **Step 4:** Commit: `git add -A && git commit -m "chore: scaffold takka-memory package (build, vitest, bin, pi entry)"`.

---

### Task 2: Core — paths + fsutil

**Files:** Create `src/core/paths.ts`, `src/core/fsutil.ts`; Test `tests/paths.test.ts`.

**Interfaces:**
- Produces: `type Scope = "global" | "project"`; `memoryRoot(): string`; `projectKeyFor(cwd: string): string`; `scopeDir(scope: Scope, cwd: string): string`; `readFileSafe(p: string): string | null`. All later tasks consume these.

- [ ] **Step 1: Write the failing test** `tests/paths.test.ts`:
```ts
import { afterEach, describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { memoryRoot, projectKeyFor, scopeDir } from "../src/core/paths.js";

const saved = process.env.TAKKA_MEMORY_ROOT;
afterEach(() => {
	if (saved === undefined) delete process.env.TAKKA_MEMORY_ROOT;
	else process.env.TAKKA_MEMORY_ROOT = saved;
});

describe("projectKeyFor", () => {
	it("matches <basename>-<sha256(cwd)[0..16]>", () => {
		const cwd = "/tmp/some/project";
		const hash = crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 16);
		expect(projectKeyFor(cwd)).toBe(`project-${hash}`);
	});
});

describe("memoryRoot", () => {
	it("defaults to ~/.takka/memory", () => {
		delete process.env.TAKKA_MEMORY_ROOT;
		expect(memoryRoot()).toBe(path.join(os.homedir(), ".takka", "memory"));
	});
	it("honors TAKKA_MEMORY_ROOT", () => {
		process.env.TAKKA_MEMORY_ROOT = "/tmp/mm";
		expect(memoryRoot()).toBe("/tmp/mm");
	});
});

describe("scopeDir", () => {
	it("global → root; project → root/projects/<key>", () => {
		process.env.TAKKA_MEMORY_ROOT = path.join("/tmp", "mm");
		expect(scopeDir("global", "/x")).toBe("/tmp/mm");
		expect(scopeDir("project", "/x/y")).toBe(path.join("/tmp/mm", "projects", projectKeyFor("/x/y")));
	});
});
```

- [ ] **Step 2:** Run `npx vitest run tests/paths.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/core/paths.ts`:
```ts
import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

export type Scope = "global" | "project";

export function memoryRoot(): string {
	return process.env.TAKKA_MEMORY_ROOT || path.join(os.homedir(), ".takka", "memory");
}

/** `<basename(cwd)>-<sha256(cwd)[0..16]>` — same scheme the old zcode bridge used, so zcode stores migrate 1:1. */
export function projectKeyFor(cwd: string): string {
	const base = path.basename(cwd);
	const hash = crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 16);
	return `${base}-${hash}`;
}

export function scopeDir(scope: Scope, cwd: string): string {
	if (scope === "global") return memoryRoot();
	return path.join(memoryRoot(), "projects", projectKeyFor(cwd));
}
```
`src/core/fsutil.ts`:
```ts
import * as fs from "node:fs";

export function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}
```
- [ ] **Step 4:** `npx vitest run tests/paths.test.ts` → PASS. `npm run build` → clean.
- [ ] **Step 5:** Commit `feat(core): memory root, zcode-compatible project key, scope dirs`.

---

### Task 3: Core — frontmatter + slugify

**Files:** Create `src/core/frontmatter.ts`; Test `tests/frontmatter.test.ts`.

**Interfaces:**
- Produces: `interface MemoryFrontmatter { name: string; description: string; type: string }`; `parseFrontmatter(md: string): MemoryFrontmatter`; `type MemoryType = "user" | "feedback" | "project" | "reference"`; `slugify(name: string): string`; `buildMemoryFile(i: { name: string; description: string; type: MemoryType; body: string }): string`. Consumed by store + pi adapter schemas.

- [ ] **Step 1: Write the failing test** `tests/frontmatter.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildMemoryFile, parseFrontmatter, slugify } from "../src/core/frontmatter.js";

describe("parseFrontmatter", () => {
	it("parses name, description, and metadata.type", () => {
		const md = "---\nname: prefer-ssh\ndescription: User prefers SSH remotes\nmetadata:\n  type: feedback\n---\n\nbody";
		expect(parseFrontmatter(md)).toEqual({ name: "prefer-ssh", description: "User prefers SSH remotes", type: "feedback" });
	});
	it("returns blanks when no frontmatter", () => {
		expect(parseFrontmatter("just text")).toEqual({ name: "", description: "", type: "" });
	});
});

describe("slugify", () => {
	it("lowercases, strips non [a-z0-9-], trims dashes and .md", () => {
		expect(slugify("Hello World!.md")).toBe("hello-world");
		expect(slugify("CI Test Gotcha")).toBe("ci-test-gotcha");
		expect(slugify("---")).toBe("memory");
	});
});

describe("buildMemoryFile", () => {
	it("round-trips through parseFrontmatter and trims body", () => {
		const md = buildMemoryFile({ name: "My Fact", description: "One liner", type: "project", body: "  Body text  " });
		expect(parseFrontmatter(md)).toEqual({ name: "my-fact", description: "One liner", type: "project" });
		expect(md.endsWith("Body text\n")).toBe(true);
	});
});
```

- [ ] **Step 2:** `npx vitest run tests/frontmatter.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/core/frontmatter.ts`:
```ts
export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryFrontmatter {
	name: string;
	description: string;
	type: string;
}

export function parseFrontmatter(md: string): MemoryFrontmatter {
	const result: MemoryFrontmatter = { name: "", description: "", type: "" };
	const m = /^---\n([\s\S]*?)\n---/.exec(md);
	if (!m) return result;
	for (const line of m[1].split("\n")) {
		let dm = /^name:\s*(.+)$/.exec(line);
		if (dm) result.name = dm[1].trim();
		dm = /^description:\s*(.+)$/.exec(line);
		if (dm) result.description = dm[1].trim();
		dm = /^\s*type:\s*(\S+)/.exec(line);
		if (dm) result.type = dm[1].trim();
	}
	return result;
}

export function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/\.md$/, "")
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "memory";
}

export function buildMemoryFile(input: {
	name: string;
	description: string;
	type: MemoryType;
	body: string;
}): string {
	const slug = slugify(input.name);
	const oneLine = input.description.replace(/\s*\n\s*/g, " ").trim();
	return [
		"---",
		`name: ${slug}`,
		`description: ${oneLine}`,
		"metadata:",
		`  type: ${input.type}`,
		"---",
		"",
		input.body.trim(),
		"",
	].join("\n");
}
```
- [ ] **Step 4:** Run test → PASS. `npm run build` → clean.
- [ ] **Step 5:** Commit `feat(core): frontmatter parse/build and slugify`.

---

### Task 4: Core — MEMORY.md index maintenance

**Files:** Create `src/core/index-md.ts`; Test `tests/index-md.test.ts`.

**Interfaces:**
- Produces: `interface IndexEntry { title: string; file: string; hook: string; line: string }`; `parseIndex(md: string): IndexEntry[]`; `upsertIndexLine(dir: string, file: string, title: string, hook: string): void`; `removeFromIndex(dir: string, file: string): void`. Consumed by store.

- [ ] **Step 1: Write the failing test** `tests/index-md.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseIndex, removeFromIndex, upsertIndexLine } from "../src/core/index-md.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "idx-"));

it("parseIndex matches - [Title](file.md) — hook lines", () => {
	const md = "# Memory Index\n\n- [A](a.md) — first\n- not a memory\n- [B](b.md) - second\n";
	expect(parseIndex(md)).toEqual([
		{ title: "A", file: "a.md", hook: "first", line: "- [A](a.md) — first" },
		{ title: "B", file: "b.md", hook: "second", line: "- [B](b.md) - second" },
	]);
});

it("upsertIndexLine creates the index with header when missing", () => {
	const dir = tmp();
	upsertIndexLine(dir, "a.md", "A", "hook one");
	const md = fs.readFileSync(path.join(dir, "MEMORY.md"), "utf-8");
	expect(md).toContain("# Memory Index");
	expect(md).toContain("- [A](a.md) — hook one");
});

it("upsertIndexLine replaces the line for the same file, collapsing hook newlines", () => {
	const dir = tmp();
	upsertIndexLine(dir, "a.md", "A", "old hook");
	upsertIndexLine(dir, "a.md", "A", "new\nhook\two");
	const md = fs.readFileSync(path.join(dir, "MEMORY.md"), "utf-8");
	expect(md).toContain("- [A](a.md) — new hook wo");
	expect(md).not.toContain("old hook");
	expect(md.match(/\[A\]\(a\.md\)/g)).toHaveLength(1);
});

it("removeFromIndex drops only the matching file line", () => {
	const dir = tmp();
	upsertIndexLine(dir, "a.md", "A", "one");
	upsertIndexLine(dir, "b.md", "B", "two");
	removeFromIndex(dir, "a.md");
	const md = fs.readFileSync(path.join(dir, "MEMORY.md"), "utf-8");
	expect(md).not.toContain("a.md");
	expect(md).toContain("b.md");
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `src/core/index-md.ts` (logic ported from the old extension, unchanged behavior):
```ts
import * as fs from "node:fs";
import { readFileSafe } from "./fsutil.js";

export interface IndexEntry {
	title: string;
	file: string;
	hook: string;
	line: string;
}

const INDEX_LINE = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)\s*[—–-]\s*(.*)$/;

export function parseIndex(md: string): IndexEntry[] {
	const entries: IndexEntry[] = [];
	for (const line of md.split("\n")) {
		const m = INDEX_LINE.exec(line);
		if (m) entries.push({ title: m[1].trim(), file: m[2].trim(), hook: m[3].trim(), line });
	}
	return entries;
}

function indexFile(dir: string): string {
	return path.join(dir, "MEMORY.md");
}

export function upsertIndexLine(dir: string, file: string, title: string, hook: string): void {
	const filePath = indexFile(dir);
	let md = readFileSafe(filePath);
	if (md === null) md = "# Memory Index\n";
	const oneLineHook = hook.replace(/\s*\n\s*/g, " ").trim();
	const newLine = `- [${title}](${file}) — ${oneLineHook}`;
	const lines = md.split("\n");
	let replaced = false;
	for (let i = 0; i < lines.length; i++) {
		const m = INDEX_LINE.exec(lines[i]);
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

export function removeFromIndex(dir: string, file: string): void {
	const md = readFileSafe(indexFile(dir));
	if (md === null) return;
	const lines = md.split("\n").filter((l) => {
		const m = INDEX_LINE.exec(l);
		return !(m && m[2].trim() === file);
	});
	fs.writeFileSync(indexFile(dir), lines.join("\n"), "utf-8");
}
```
Add missing import: `import * as path from "node:path";` at top.
- [ ] **Step 4:** Run → PASS. `npm run build` → clean.
- [ ] **Step 5:** Commit `feat(core): MEMORY.md index parse/upsert/remove`.

---

### Task 5: Core — store (CRUD + scope semantics)

**Files:** Create `src/core/store.ts`; Test `tests/store.test.ts`.

**Interfaces:**
- Consumes: paths, frontmatter, index-md, fsutil from Tasks 2–4.
- Produces (used by pi adapter, MCP server, CLI):
```ts
type Scope = "global" | "project";
interface MemoryInfo { name: string; scope: Scope; type: string; description: string }
interface SearchResult { scope: Scope; file: string; line: number; text: string }
interface ReadResult { scope: Scope; path: string; content: string }
interface WriteInput { name: string; description: string; type: MemoryType; body: string; scope?: Scope; title?: string }
interface WriteResult { name: string; scope: Scope; file: string }
interface DeleteResult { scope: Scope; file: string }
listMemories(cwd: string, scope?: Scope): MemoryInfo[]
searchMemories(cwd: string, query: string, scope?: Scope): SearchResult[]   // cap 40
readMemory(cwd: string, name: string, scope?: Scope): ReadResult | null     // fallback project→global
writeMemory(cwd: string, input: WriteInput): WriteResult                    // default scope "project"
deleteMemory(cwd: string, name: string, scope?: Scope): DeleteResult | null // fallback project→global
readIndexMd(scope: Scope, cwd: string): string | null                       // trimmed index md, null if no entries
```

- [ ] **Step 1: Write the failing test** `tests/store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { deleteMemory, listMemories, readIndexMd, readMemory, searchMemories, writeMemory } from "../src/core/store.js";

let root: string;
const CWD = "/fixture/project";
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "store-"));
	process.env.TAKKA_MEMORY_ROOT = root;
});
afterEach(() => delete process.env.TAKKA_MEMORY_ROOT);

const writeBoth = () => {
	writeMemory(CWD, { name: "shared-name", description: "project copy", type: "project", body: "project body" });
	writeMemory(CWD, { name: "shared-name", description: "global copy", type: "user", body: "global body", scope: "global" });
};

it("write defaults to project scope and upserts the index", () => {
	const r = writeMemory(CWD, { name: "My Fact", description: "d", type: "project", body: "b" });
	expect(r.scope).toBe("project");
	expect(r.name).toBe("my-fact");
	const dir = path.join(root, "projects");
	expect(fs.readdirSync(dir).some((k) => k.startsWith("project-"))).toBe(true);
	const key = fs.readdirSync(dir)[0];
	const memDir = path.join(dir, key);
	expect(fs.readFileSync(path.join(memDir, "my-fact.md"), "utf-8")).toContain("Body");
	expect(fs.readFileSync(path.join(memDir, "MEMORY.md"), "utf-8")).toContain("[my-fact](my-fact.md)");
});

it("read without scope falls back project → global", () => {
	writeBoth();
	expect(readMemory(CWD, "shared-name")?.scope).toBe("project");
	expect(readMemory(CWD, "shared-name")?.content).toContain("project body");
	expect(readMemory(CWD, "shared-name", "global")?.content).toContain("global body");
	expect(readMemory(CWD, "missing")).toBeNull();
});

it("list merges both scopes with labels", () => {
	writeBoth();
	const infos = listMemories(CWD);
	expect(infos.filter((i) => i.name === "shared-name")).toHaveLength(2);
	expect(infos.map((i) => i.scope).sort()).toEqual(["global", "project"]);
	expect(listMemories(CWD, "global")).toHaveLength(1);
});

it("search scans both scopes and caps at 40 hits", () => {
	writeBoth();
	const hits = searchMemories(CWD, "copy");
	expect(hits).toHaveLength(2);
	expect(hits.every((h) => h.scope === "global" || h.scope === "project")).toBe(true);
	expect(searchMemories(CWD, "zzz")).toHaveLength(0);
});

it("delete resolves project first and removes file + index line", () => {
	writeBoth();
	const r = deleteMemory(CWD, "shared-name");
	expect(r?.scope).toBe("project");
	expect(readMemory(CWD, "shared-name")?.scope).toBe("global"); // fell back
	expect(deleteMemory(CWD, "missing")).toBeNull();
});

it("rejects path traversal names", () => {
	writeMemory(CWD, { name: "safe", description: "d", type: "user", body: "b" });
	expect(readMemory(CWD, "../../etc/passwd")).toBeNull();
	expect(deleteMemory(CWD, "../escape")).toBeNull();
});

it("readIndexMd returns null for missing/empty scope, trimmed md otherwise", () => {
	expect(readIndexMd("global", CWD)).toBeNull();
	writeMemory(CWD, { name: "g", description: "d", type: "user", body: "b", scope: "global" });
	expect(readIndexMd("global", CWD)).toContain("[g](g.md)");
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `src/core/store.ts`:
```ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryType } from "./frontmatter.js";
import { buildMemoryFile, parseFrontmatter, slugify } from "./frontmatter.js";
import { removeFromIndex, upsertIndexLine, parseIndex } from "./index-md.js";
import { readFileSafe } from "./fsutil.js";
import { scopeDir, type Scope } from "./paths.js";

export interface MemoryInfo { name: string; scope: Scope; type: string; description: string }
export interface SearchResult { scope: Scope; file: string; line: number; text: string }
export interface ReadResult { scope: Scope; path: string; content: string }
export interface WriteInput { name: string; description: string; type: MemoryType; body: string; scope?: Scope; title?: string }
export interface WriteResult { name: string; scope: Scope; file: string }
export interface DeleteResult { scope: Scope; file: string }

const INDEX_FILE = "MEMORY.md";
const SEARCH_CAP = 40;

function memoryFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== INDEX_FILE).sort();
}

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

export function searchMemories(cwd: string, query: string, scope?: Scope): SearchResult[] {
	const q = query.toLowerCase().trim();
	const hits: SearchResult[] = [];
	if (!q) return hits;
	for (const { scope: s, dir } of scopesSelected(cwd, scope)) {
		const files = fs.existsSync(dir)
			? [INDEX_FILE, ...memoryFiles(dir)]
			: [];
		for (const f of files) {
			const raw = readFileSafe(path.join(dir, f)) ?? "";
			const lines = raw.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (hits.length >= SEARCH_CAP) return hits;
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
	fs.writeFileSync(path.join(dir, file), buildMemoryFile(input), "utf-8");
	upsertIndexLine(dir, file, input.title?.trim() || slug, input.description);
	return { name: slug, scope, file };
}

export function deleteMemory(cwd: string, name: string, scope?: Scope): DeleteResult | null {
	for (const { scope: s, dir } of scopesSelected(cwd, scope)) {
		const p = resolveMemoryFile(dir, name);
		if (p) {
			const file = path.basename(p);
			fs.rmSync(p);
			removeFromIndex(dir, file);
			return { scope: s, file };
		}
	}
	return null;
}

export function readIndexMd(scope: Scope, cwd: string): string | null {
	const dir = scopeDir(scope, cwd);
	const md = readFileSafe(path.join(dir, INDEX_FILE));
	if (md === null || !parseIndex(md).length) return null;
	return md.trim();
}
```
- [ ] **Step 4:** Run → PASS. `npm run build` → clean.
- [ ] **Step 5:** Commit `feat(core): memory store CRUD with global/project scope semantics`.

---

### Task 6: Core — import-zcode migration

**Files:** Create `src/core/import-zcode.ts`; Test `tests/import-zcode.test.ts`.

**Interfaces:**
- Consumes: `fs`, `path` only.
- Produces:
```ts
interface ProjectImport { key: string; copied: number; skipped: number; updated: number }
interface ImportSummary { projects: ProjectImport[]; total: { copied: number; skipped: number; updated: number } }
importZcode(zcodeRoot: string, takkaRoot: string, dryRun: boolean): ImportSummary
```
Semantics: source is `<zcodeRoot>/<key>/memory/`; destination `<takkaRoot>/projects/<key>/`; per file: identical target → skipped, missing → copied, differing → overwritten (counted updated); `dryRun` writes nothing.

- [ ] **Step 1: Write the failing test** `tests/import-zcode.test.ts`:
```ts
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { importZcode } from "../src/core/import-zcode.js";

let zroot: string; let troot: string;
beforeEach(() => {
	zroot = fs.mkdtempSync(path.join(os.tmpdir(), "zc-"));
	troot = fs.mkdtempSync(path.join(os.tmpdir(), "tk-"));
});
afterEach(() => { fs.rmSync(zroot, { recursive: true, force: true }); fs.rmSync(troot, { recursive: true, force: true }); });

function fixture(source: string, content: string) {
	fs.mkdirSync(path.join(zroot, "proj-abc", "memory"), { recursive: true });
	fs.writeFileSync(path.join(zroot, "proj-abc", "memory", source), content, "utf-8");
}

it("copies project memory dirs 1:1", () => {
	fixture("MEMORY.md", "# Memory Index\n");
	fixture("a.md", "---\nname: a\ndescription: d\nmetadata:\n  type: user\n---\n\nbody\n");
	const s = importZcode(zroot, troot, false);
	expect(s.projects).toEqual([{ key: "proj-abc", copied: 2, skipped: 0, updated: 0 }]);
	expect(fs.readFileSync(path.join(troot, "projects", "proj-abc", "memory", "a.md"), "utf-8")).toContain("body");
});

it("is idempotent: rerun skips identical files, overwrites changed ones", () => {
	fixture("a.md", "v1");
	importZcode(zroot, troot, false);
	const second = importZcode(zroot, troot, false);
	expect(second.projects[0]).toMatchObject({ copied: 0, skipped: 1, updated: 0 });
	fixture("a.md", "v2");
	const third = importZcode(zroot, troot, false);
	expect(third.projects[0]).toMatchObject({ skipped: 0, updated: 1 });
	expect(fs.readFileSync(path.join(troot, "projects", "proj-abc", "memory", "a.md"), "utf-8")).toBe("v2");
});

it("dryRun reports without writing", () => {
	fixture("a.md", "x");
	const s = importZcode(zroot, troot, true);
	expect(s.projects[0]).toMatchObject({ copied: 1 });
	expect(fs.existsSync(path.join(troot, "projects"))).toBe(false);
});

it("ignores project dirs without a memory subdir and empty roots", () => {
	fs.mkdirSync(path.join(zroot, "nomem"), { recursive: true });
	expect(importZcode(zroot, troot, false).projects).toEqual([]);
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `src/core/import-zcode.ts`:
```ts
import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectImport { key: string; copied: number; skipped: number; updated: number }
export interface ImportSummary {
	projects: ProjectImport[];
	total: { copied: number; skipped: number; updated: number };
}

export function importZcode(zcodeRoot: string, takkaRoot: string, dryRun: boolean): ImportSummary {
	const projects: ProjectImport[] = [];
	const total = { copied: 0, skipped: 0, updated: 0 };
	if (!fs.existsSync(zcodeRoot)) return { projects, total };
	for (const key of fs.readdirSync(zcodeRoot).sort()) {
		const srcDir = path.join(zcodeRoot, key, "memory");
		if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) continue;
		const dstDir = path.join(takkaRoot, "projects", key);
		const stat = { key, copied: 0, skipped: 0, updated: 0 };
		for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort()) {
			const src = path.join(srcDir, f);
			const dst = path.join(dstDir, f);
			const srcContent = fs.readFileSync(src, "utf-8");
			if (fs.existsSync(dst) && fs.readFileSync(dst, "utf-8") === srcContent) {
				stat.skipped++;
			} else {
				const existed = fs.existsSync(dst);
				if (!dryRun) {
					fs.mkdirSync(dstDir, { recursive: true });
					fs.writeFileSync(dst, srcContent, "utf-8");
				}
				if (existed) stat.updated++; else stat.copied++;
			}
		}
		projects.push(stat);
		total.copied += stat.copied;
		total.skipped += stat.skipped;
		total.updated += stat.updated;
	}
	return { projects, total };
}
```
- [ ] **Step 4:** Run → PASS. `npm run build` → clean.
- [ ] **Step 5:** Commit `feat(core): non-destructive import-zcode migration`.

---

### Task 7: Adapters — format helpers + MCP server + bin wiring

**Files:** Create `src/adapters/format.ts`, `src/mcp/server.ts`; Test `tests/mcp.test.ts`; extend `src/cli.ts` with the `mcp` subcommand.

**Interfaces:**
- Consumes: store from Task 5, `VERSION` from Task 1.
- Produces:
```ts
formatList(infos: MemoryInfo[]): string          // "- <name> [<scope>] [<type>] <desc>"; friendly empty message
formatSearch(results: SearchResult[], query: string): string   // "[<scope>] <file>:<line>: <text>"
formatRead(r: ReadResult): string                // "[<scope>] <path>\n\n<content>"
createMcpServer(cwd?: string): McpServer         // registers the 5 tools
runMcpServer(cwd?: string): Promise<void>        // stdio transport
```
MCP tool names/params mirror the pi adapter exactly: `memory_list{scope?}`, `memory_read{name,scope?}`, `memory_search{query,scope?}`, `memory_write{name,description,type,body,scope?,title?}`, `memory_delete{name,scope?}` with `scope: z.enum(["global","project"]).optional()`, `type: z.enum(["user","feedback","project","reference"])`, write scope defaulting to `"project"`.

- [ ] **Step 1: Write the failing test** `tests/mcp.test.ts`:
```ts
import { afterEach, beforeEach, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp/server.js";

let root: string; let client: Client;
const CWD = "/fixture/mcp";
beforeEach(async () => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-"));
	process.env.TAKKA_MEMORY_ROOT = root;
	const [ct, st] = InMemoryTransport.createLinkedPair();
	client = new Client({ name: "test", version: "0" });
	await Promise.all([createMcpServer(CWD).connect(st), client.connect(ct)]);
});
afterEach(async () => {
	await client.close();
	delete process.env.TAKKA_MEMORY_ROOT;
});

it("exposes the five memory tools", async () => {
	const { tools } = await client.listTools();
	expect(tools.map((t) => t.name).sort()).toEqual(
		["memory_delete", "memory_list", "memory_read", "memory_search", "memory_write"],
	);
});

it("write → list → read round-trip with scope labels", async () => {
	await client.callTool({ name: "memory_write", arguments: { name: "fact", description: "one", type: "user", body: "body one" } });
	const list = await client.callTool({ name: "memory_list", arguments: {} });
	expect(list.content?.[0]?.text).toContain("[project]");
	const read = await client.callTool({ name: "memory_read", arguments: { name: "fact" } });
	expect(read.content?.[0]?.text).toContain("body one");
	const search = await client.callTool({ name: "memory_search", arguments: { query: "one" } });
	expect(search.content?.[0]?.text).toContain("[project]");
	const del = await client.callTool({ name: "memory_delete", arguments: { name: "fact" } });
	expect(del.content?.[0]?.text).toContain("Deleted");
});

it("global scope requires explicit scope param", async () => {
	await client.callTool({ name: "memory_write", arguments: { name: "g", description: "d", type: "user", body: "b", scope: "global" } });
	const list = await client.callTool({ name: "memory_list", arguments: { scope: "global" } });
	expect(list.content?.[0]?.text).toContain("[global]");
	expect(fs.existsSync(path.join(root, "g.md"))).toBe(true);
});
```

- [ ] **Step 2:** Run → FAIL (module not found).
- [ ] **Step 3: Implement** `src/adapters/format.ts`:
```ts
import type { MemoryInfo, ReadResult, SearchResult } from "../core/store.js";

export function formatList(infos: MemoryInfo[]): string {
	if (!infos.length) {
		return 'No memories yet. Create one with memory_write (scope defaults to "project"; pass scope:"global" for cross-project facts).';
	}
	return infos.map((i) => `- ${i.name} [${i.scope}] [${i.type || "?"}] ${i.description || "(no description)"}`).join("\n");
}

export function formatSearch(results: SearchResult[], query: string): string {
	if (!results.length) return `No matches for '${query}'.`;
	return results.map((r) => `[${r.scope}] ${r.file}:${r.line}: ${r.text}`).join("\n");
}

export function formatRead(r: ReadResult): string {
	return `[${r.scope}] ${r.path}\n\n${r.content}`;
}
```
`src/mcp/server.ts`:
```ts
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
		{ description: "List persistent memories (both scopes, labeled [global]/[project]).", inputSchema: { scope: scopeSchema } },
		async ({ scope }) => text(formatList(listMemories(cwd, scope))),
	);
	server.registerTool(
		"memory_read",
		{
			description: "Read one full memory by name; without scope, project wins over global.",
			inputSchema: { name: z.string().describe("Memory name, e.g. 'ci-test-gotcha'"), scope: scopeSchema },
		},
		async ({ name, scope }) => {
			const r = readMemory(cwd, name, scope);
			return r ? text(formatRead(r)) : errText(`No memory named '${name}'. Use memory_list first.`);
		},
	);
	server.registerTool(
		"memory_search",
		{ description: "Case-insensitive text search across memory files (both scopes).", inputSchema: { query: z.string(), scope: scopeSchema } },
		async ({ query, scope }) => text(formatSearch(searchMemories(cwd, query, scope), query)),
	);
	server.registerTool(
		"memory_write",
		{
			description: 'Create/update one memory file + index. scope defaults to "project"; pass "global" for cross-project facts.',
			inputSchema: {
				name: z.string().describe("Short kebab-case slug, e.g. 'prefer-ssh-remotes'"),
				description: z.string().describe("One-line summary used for recall/index"),
				type: z.enum(["user", "feedback", "project", "reference"]).describe("Memory type"),
				body: z.string().describe("Markdown body; feedback/project types should include **Why:** and **How to apply:**"),
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
		{ description: "Delete one memory and remove its index line; without scope, project wins over global.", inputSchema: { name: z.string(), scope: scopeSchema } },
		async ({ name, scope }) => {
			const r = deleteMemory(cwd, name, scope);
			return r ? text(`Deleted '${r.file}' (${r.scope} scope) and removed its index line.`) : errText(`No memory named '${name}'.`);
		},
	);
	return server;
}

export async function runMcpServer(cwd: string = process.cwd()): Promise<void> {
	const server = createMcpServer(cwd);
	await server.connect(new StdioServerTransport());
}
```
Extend `src/cli.ts`: `case "mcp":` → dynamic-import `runMcpServer`, await it, `return 0`.
- [ ] **Step 4:** Run `npx vitest run tests/mcp.test.ts` → PASS. `npm run build` → clean; `node bin/takka-memory.js mcp &` starts silently (kill it).
- [ ] **Step 5:** Commit `feat(mcp): stdio MCP server exposing the five memory tools`.

---

### Task 8: CLI — list/read/search/path/import-zcode

**Files:** Modify `src/cli.ts`; Test `tests/cli.test.ts`.

**Interfaces:**
- Consumes: store, format, importZcode, memoryRoot/scopeDir.
- Produces: `main(argv: string[]): Promise<number>` handling `mcp | list [scope] | read <name> | search <query…> | path | import-zcode [--dry-run] [--zcode-root <dir>] | --help`; returns exit code (0 ok, 1 error/usage). Usage text:
```
takka-memory — agent-agnostic persistent memory

Usage: takka-memory <command>
  mcp                                  Start the MCP stdio server
  list [global|project]                List memories (both scopes if omitted)
  read <name>                          Read one memory (project wins over global)
  search <query...>                    Case-insensitive text search
  path                                 Print store root and current project dir
  import-zcode [--dry-run] [--zcode-root <dir>]
                                       Copy zcode memories (~/.zcode/cli/memories/projects) into this store
```

- [ ] **Step 1: Write the failing test** `tests/cli.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { main } from "../src/cli.js";
import { writeMemory } from "../src/core/store.js";

let root: string; let log: string[];
const CWD = "/fixture/cli";
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-"));
	process.env.TAKKA_MEMORY_ROOT = root;
	log = [];
	vi.spyOn(console, "log").mockImplementation((...a) => log.push(a.join(" ")));
});
afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.TAKKA_MEMORY_ROOT;
});

it("list prints labeled memories", async () => {
	writeMemory(CWD, { name: "fact", description: "desc here", type: "user", body: "b" });
	expect(await main(["list"]))).toBe(0);
	expect(log.join("\n")).toContain("- fact [project] [user] desc here");
});

it("read prints scoped content; missing name exits 1", async () => {
	writeMemory(CWD, { name: "fact", description: "d", type: "user", body: "hello" });
	expect(await main(["read", "fact"])).toBe(0);
	expect(log.join("\n")).toContain("hello");
	expect(await main(["read", "nope"])).toBe(1);
});

it("search prints hits, path prints root", async () => {
	writeMemory(CWD, { name: "fact", description: "findable", type: "user", body: "b" });
	await main(["search", "findable"]);
	expect(log.join("\n")).toContain("[project]");
	await main(["path"]);
	expect(log.join("\n")).toContain(root);
});

it("import-zcode copies a fixture store; --dry-run does not", async () => {
	fs.mkdirSync(path.join(root, "zc", "proj-1", "memory"), { recursive: true });
	fs.writeFileSync(path.join(root, "zc", "proj-1", "memory", "a.md"), "x", "utf-8");
	expect(await main(["import-zcode", "--dry-run", "--zcode-root", path.join(root, "zc")])).toBe(0);
	expect(fs.existsSync(path.join(root, "projects"))).toBe(false);
	expect(await main(["import-zcode", "--zcode-root", path.join(root, "zc")])).toBe(0);
	expect(fs.readFileSync(path.join(root, "projects", "proj-1", "memory", "a.md"), "utf-8")).toBe("x");
	expect(log.join("\n")).toContain("proj-1");
});

it("unknown command prints usage and exits 1", async () => {
	expect(await main(["bogus"])).toBe(1);
	expect(log.join("\n")).toContain("Usage:");
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** full `src/cli.ts`:
```ts
import * as path from "node:path";
import { importZcode } from "./core/import-zcode.js";
import { memoryRoot, scopeDir, type Scope } from "./core/paths.js";
import { deleteNotNeeded } from "./core/store.js"; // placeholder removed in final code
import { listMemories, readMemory, searchMemories } from "./core/store.js";
import { formatList, formatRead, formatSearch } from "./adapters/format.js";

const USAGE = `takka-memory — agent-agnostic persistent memory

Usage: takka-memory <command>
  mcp                                  Start the MCP stdio server
  list [global|project]                List memories (both scopes if omitted)
  read <name>                          Read one memory (project wins over global)
  search <query...>                    Case-insensitive text search
  path                                 Print store root and current project dir
  import-zcode [--dry-run] [--zcode-root <dir>]
                                       Copy zcode memories (~/.zcode/cli/memories/projects) into this store`;

function parseScope(s: string | undefined): Scope | undefined {
	if (s === undefined) return undefined;
	if (s === "global" || s === "project") return s;
	throw new Error(`invalid scope '${s}' (use global|project)`);
}

export async function main(argv: string[]): Promise<number> {
	const [cmd, ...rest] = argv;
	const cwd = process.cwd();
	try {
		switch (cmd) {
			case "mcp": {
				const { runMcpServer } = await import("./mcp/server.js");
				await runMcpServer();
				return 0;
			}
			case "list": {
				console.log(formatList(listMemories(cwd, parseScope(rest[0]))));
				return 0;
			}
			case "read": {
				if (!rest[0]) throw new Error("usage: takka-memory read <name>");
				const r = readMemory(cwd, rest[0], parseScope(rest[1]));
				if (!r) {
					console.log(`No memory named '${rest[0]}'.`);
					return 1;
				}
				console.log(formatRead(r));
				return 0;
			}
			case "search": {
				const query = rest.join(" ").trim();
				if (!query) throw new Error("usage: takka-memory search <query...>");
				console.log(formatSearch(searchMemories(cwd, query), query));
				return 0;
			}
			case "path": {
				console.log(`root:   ${memoryRoot()}`);
				console.log(`project: ${scopeDir("project", cwd)}`);
				return 0;
			}
			case "import-zcode": {
				const dryRun = rest.includes("--dry-run");
				const zrFlag = rest.indexOf("--zcode-root");
				const zcodeRoot = zrFlag >= 0 ? rest[zrFlag + 1] : path.join(process.env.HOME ?? "", ".zcode", "cli", "memories", "projects");
				const s = importZcode(zcodeRoot, memoryRoot(), dryRun);
				for (const p of s.projects) {
					console.log(`${p.key}: copied ${p.copied}, skipped ${p.skipped}, updated ${p.updated}${dryRun ? " (dry-run)" : ""}`);
				}
				console.log(`total: copied ${s.total.copied}, skipped ${s.total.skipped}, updated ${s.total.updated}${s.projects.length === 0 ? " (no zcode project memories found)" : ""}`);
				return 0;
			}
			default:
				console.log(USAGE);
				return cmd === undefined || cmd === "--help" || cmd === "-h" ? 0 : 1;
		}
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		return 1;
	}
}
```
Note: remove the stray `deleteNotNeeded` import line — final file imports only what it uses (`importZcode`, `memoryRoot`, `scopeDir`, `Scope`, `listMemories`, `readMemory`, `searchMemories`, formatters). `--help`/`-h`/no-args print usage with exit 0.
- [ ] **Step 4:** Run `npx vitest run tests/cli.test.ts` → PASS. Full suite `npm test` → green.
- [ ] **Step 5:** Commit `feat(cli): list/read/search/path/import-zcode commands`.

---

### Task 9: Pi adapter — injection, tools, deprecated aliases

**Files:** Create `src/adapters/pi.ts`; Test `tests/pi-adapter.test.ts`.

**Interfaces:**
- Consumes: store, format, `Type`/`StringEnum` from `@earendil-works/pi-ai`, type-only `ExtensionAPI`.
- Produces:
```ts
buildInjection(cwd: string): string | null        // pure; sections only for non-empty scopes; 8000-char truncation per index
makeHandlers(cwd: string): { list, read, search, write, delete }   // (params) => {content, isError?}
export default function takkaMemoryExtension(pi: ExtensionAPI): void
```
Tool text contract: read miss → `No memory named '<name>'. Use memory_list first.`; write → `Saved memory '<slug>' (<type>, <scope> scope) — index updated.`; delete → `Deleted '<file>' (<scope> scope) and removed its index line.`; alias responses append `\n\n(deprecated alias — use memory_<verb>)`.

- [ ] **Step 1: Write the failing test** `tests/pi-adapter.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildInjection, makeHandlers } from "../src/adapters/pi.js";
import { writeMemory } from "../src/core/store.js";

let root: string;
const CWD = "/fixture/pi";
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-"));
	process.env.TAKKA_MEMORY_ROOT = root;
});
afterEach(() => delete process.env.TAKKA_MEMORY_ROOT);

const text = (r: { content: { text: string }[] }) => r.content[0].text;

describe("buildInjection", () => {
	it("returns null when both scopes are empty", () => {
		expect(buildInjection(CWD)).toBeNull();
	});
	it("emits separate global/project sections with scope guidance", () => {
		writeMemory(CWD, { name: "g", description: "global fact", type: "user", body: "b", scope: "global" });
		writeMemory(CWD, { name: "p", description: "project fact", type: "project", body: "b" });
		const md = buildInjection(CWD)!;
		expect(md).toContain("## Takka Memory (persistent memory)");
		expect(md).toContain("### Global memories");
		expect(md).toContain("[g](g.md)");
		expect(md).toContain("### Project memories");
		expect(md).toContain("[p](p.md)");
		expect(md).toContain('scope defaults to "project"');
	});
	it("truncates an oversized index at 8000 chars", () => {
		for (let i = 0; i < 900; i++) {
			writeMemory(CWD, { name: `pad-${i}`, description: "x".repeat(20), type: "user", body: "b" });
		}
		const md = buildInjection(CWD)!;
		expect(md).toContain("(truncated)");
		expect(md.length).toBeLessThan(12000);
	});
});

describe("handlers", () => {
	it("write defaults to project and reports scope; alias-friendly messages", async () => {
		const h = makeHandlers(CWD);
		const w = await h.write({ name: "fact", description: "d", type: "feedback", body: "b" });
		expect(text(w)).toContain("(feedback, project scope)");
		const l = await h.list({});
		expect(text(l)).toContain("- fact [project] [feedback]");
		const r = await h.read({ name: "fact" });
		expect(text(r)).toContain("[project]");
		const miss = await h.read({ name: "nope" });
		expect((miss as { isError?: boolean }).isError).toBe(true);
		const d = await h.delete({ name: "fact" });
		expect(text(d)).toContain("Deleted 'fact.md' (project scope)");
	});
	it("search returns labeled hits", async () => {
		const h = makeHandlers(CWD);
		await h.write({ name: "s", description: "needle here", type: "user", body: "b" });
		const res = await h.search({ query: "needle" });
		expect(text(res)).toContain("[project]");
	});
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `src/adapters/pi.ts`:
```ts
// takka-memory pi adapter — system-prompt injection + native memory_* tools.
// Deprecated aliases zcode_memory_* map to the same handlers until the next major.
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { deleteMemory, listMemories, readMemory, searchMemories, writeMemory } from "../core/store.js";
import type { MemoryType, } from "../core/frontmatter.js";
import { readIndexMd } from "../core/store.js";
import { formatList, formatRead, formatSearch } from "./format.js";

const MAX_INDEX_CHARS = 8000;

type ToolResult = { content: [{ type: "text"; text: string }]; isError?: boolean };
const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const err = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

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
		write: async (params: { name: string; description: string; type: MemoryType; body: string; scope?: Scope; title?: string }) => {
			const r = writeMemory(cwd, params);
			return ok(`Saved memory '${r.name}' (${params.type}, ${r.scope} scope) — index updated.`);
		},
		delete: async (params: { name: string; scope?: Scope }) => {
			const r = deleteMemory(cwd, params.name, params.scope);
			return r ? ok(`Deleted '${r.file}' (${r.scope} scope) and removed its index line.`) : err(`No memory named '${params.name}'.`);
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
		body: Type.String({ description: "Markdown body; feedback/project entries should include **Why:** and **How to apply:**" }),
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
	const alias = async (
		run: () => Promise<ToolResult>,
		verb: string,
	): Promise<ToolResult> => {
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
```
- [ ] **Step 4:** Run `npx vitest run tests/pi-adapter.test.ts` → PASS. `npm run build` → `dist/adapters/pi.js` exists; smoke: `node -e "import('./dist/adapters/pi.js').then(m => console.log(typeof m.default))"` prints `function`.
- [ ] **Step 5:** Commit `feat(pi): takka-memory adapter with prompt injection, memory_* tools, deprecated zcode aliases`.

---

### Task 10: Docs, integrations, final verification

**Files:** Rewrite `README.md`; Modify `CHANGELOG.md`; Create `integrations/claude-code/CLAUDE-snippet.md`, `integrations/claude-code/takka-memory-skill.md`.

- [ ] **Step 1:** Rewrite `README.md` — title `takka-memory`; multi-harness story; storage layout with both scopes; scope rules table; install per harness (`pi install git:github.com/dchya24/pi-zcode-memory` updated to the renamed repo URL + `pi install npm:takka-memory`; `claude mcp add takka-memory -- npx takka-memory mcp`); CLI usage block (from Task 8); env vars `TAKKA_MEMORY_ROOT` / `TAKKA_MEMORY_DISABLE`; memory file format example; migration section (`npx takka-memory import-zcode [--dry-run]`); migration note from the old zcode bridge (aliases kept); remove all `ZCODE_*` env references; keep Coexistence note about pi's built-in `~/.pi/agent/memory`.
- [ ] **Step 2:** `CHANGELOG.md` — add `## 0.2.0` entry: standalone takka-memory rewrite (global+project scopes, MCP server, CLI, import-zcode, deprecated zcode_memory_* aliases, removed live bridge and ZCODE_* env vars).
- [ ] **Step 3:** `integrations/claude-code/CLAUDE-snippet.md`:
```markdown
<!-- takka-memory -->
## Persistent memory (takka-memory)
At session start, run `npx takka-memory list` to load remembered facts (global + this project).
Persist durable preferences, decisions, and lessons with the memory_write tool (or `npx takka-memory` MCP tools if configured):
- scope "global" (explicit) for facts that apply in every project; scope defaults to "project".
- One fact per file, kebab-case name, one-line description; type: user | feedback | project | reference.
```
`integrations/claude-code/takka-memory-skill.md`: frontmatter `name: takka-memory`, `description: Recall and persist long-term memory via the takka-memory store (global + per-project scopes)`; body: when to recall (session start `takka-memory list`, before answering preference questions), when to persist ("remember this", durable feedback/decisions), tool list with scope rules, and file-format reference identical to README.
- [ ] **Step 4:** Final verification: `npm run build && npm test` (all suites green) ; `node bin/takka-memory.js` prints usage with exit 0; `node bin/takka-memory.js --help` exit 0; `node bin/takka-memory.js bogus` exit 1.
- [ ] **Step 5:** Commit `docs: takka-memory README, changelog, claude-code integration assets`.

---

## Plan Self-Review Notes

- Spec coverage: storage layout (T2), scope semantics (T5), pi adapter + aliases + injection (T9), MCP server (T7), CLI incl. import-zcode (T6, T8), env vars (T1/T9), tests (every task), docs/integrations (T10). Bridge: intentionally absent (dropped by decision).
- Type consistency: `Scope`, `MemoryInfo`, `ReadResult`, `SearchResult`, `WriteInput/WriteResult`, `DeleteResult`, `ProjectImport/ImportSummary` defined once in Tasks 2/5/6 and consumed verbatim in T7/T8/T9; tool name sets identical in T7 (MCP) and T9 (pi).
- Execution note: Task 8 CLI code block contains an intentionally-flagged stray import line — implementers must remove it (final import list stated under the block).


