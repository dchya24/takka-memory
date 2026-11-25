import { afterEach, beforeEach, expect, it } from "vitest";
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
	expect(fs.readFileSync(path.join(memDir, "my-fact.md"), "utf-8")).toContain("b");
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

it("search scans index + files in both scopes", () => {
	writeBoth();
	const hits = searchMemories(CWD, "copy");
	// matches in both memory bodies and their MEMORY.md index hook lines
	expect(hits.length).toBeGreaterThanOrEqual(2);
	expect(new Set(hits.map((h) => h.scope))).toEqual(new Set(["global", "project"]));
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

it("search honours a custom limit", () => {
	for (let i = 0; i < 10; i++) {
		writeMemory(CWD, { name: `hit-${i}`, description: "needle", type: "user", body: "needle" });
	}
	expect(searchMemories(CWD, "needle").length).toBeGreaterThan(10);
	expect(searchMemories(CWD, "needle", undefined, { limit: 3 })).toHaveLength(3);
	expect(searchMemories(CWD, "needle", undefined, { limit: 1 })).toHaveLength(1);
});

it("search stops early when the abort signal fires", () => {
	writeMemory(CWD, { name: "a", description: "needle", type: "user", body: "needle" });
	const ac = new AbortController();
	ac.abort();
	expect(searchMemories(CWD, "needle", undefined, { signal: ac.signal })).toHaveLength(0);
});

it("keeps the index consistent under concurrent writes", async () => {
	// Fire many writes in parallel; the dir lock must keep every index line.
	await Promise.all(
		Array.from({ length: 20 }, (_, i) =>
			Promise.resolve().then(() =>
				writeMemory(CWD, { name: `concurrent-${i}`, description: `d${i}`, type: "user", body: "b" }),
			),
		),
	);
	const key = fs.readdirSync(path.join(root, "projects"))[0];
	const memDir = path.join(root, "projects", key);
	const index = fs.readFileSync(path.join(memDir, "MEMORY.md"), "utf-8");
	const lines = index.split("\n").filter((l) => l.includes("](concurrent-"));
	expect(lines).toHaveLength(20);
	// No temp files leaked from atomic writes.
	expect(fs.readdirSync(memDir).filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
});

it("does not leave a lock directory behind after writes", () => {
	writeMemory(CWD, { name: "x", description: "d", type: "user", body: "b" });
	const key = fs.readdirSync(path.join(root, "projects"))[0];
	const memDir = path.join(root, "projects", key);
	expect(fs.existsSync(path.join(memDir, ".lock"))).toBe(false);
});
