import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { main } from "../src/cli.js";
import { writeMemory } from "../src/core/store.js";

let root: string;
let log: string[];
// main() resolves the project scope from process.cwd(); the store root stays isolated via TAKKA_MEMORY_ROOT.
const CWD = process.cwd();
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
	expect(await main(["list"])).toBe(0);
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

it("search honours --limit and rejects invalid values", async () => {
	for (let i = 0; i < 5; i++) {
		writeMemory(CWD, { name: `n-${i}`, description: "needle", type: "user", body: "needle" });
	}
	await main(["search", "--limit", "2", "needle"]);
	expect(log.join("\n").split("\n").filter((l) => l.includes("needle")).length).toBeLessThanOrEqual(2);
	log = [];
	expect(await main(["search", "--limit", "0", "needle"])).toBe(1);
	expect(await main(["search", "--limit", "abc", "needle"])).toBe(1);
});

it("import-zcode copies a fixture store; --dry-run does not", async () => {
	fs.mkdirSync(path.join(root, "zc", "proj-1", "memory"), { recursive: true });
	fs.writeFileSync(path.join(root, "zc", "proj-1", "memory", "a.md"), "x", "utf-8");
	expect(await main(["import-zcode", "--dry-run", "--zcode-root", path.join(root, "zc")])).toBe(0);
	expect(fs.existsSync(path.join(root, "projects"))).toBe(false);
	expect(await main(["import-zcode", "--zcode-root", path.join(root, "zc")])).toBe(0);
	expect(fs.readFileSync(path.join(root, "projects", "proj-1", "a.md"), "utf-8")).toBe("x");
	expect(log.join("\n")).toContain("proj-1");
});

it("unknown command prints usage and exits 1; --help exits 0", async () => {
	expect(await main(["bogus"])).toBe(1);
	expect(log.join("\n")).toContain("Usage:");
	expect(await main(["--help"])).toBe(0);
});
