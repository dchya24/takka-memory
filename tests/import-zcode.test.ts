import { afterEach, beforeEach, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { importZcode } from "../src/core/import-zcode.js";

let zroot: string;
let troot: string;
beforeEach(() => {
	zroot = fs.mkdtempSync(path.join(os.tmpdir(), "zc-"));
	troot = fs.mkdtempSync(path.join(os.tmpdir(), "tk-"));
});
afterEach(() => {
	fs.rmSync(zroot, { recursive: true, force: true });
	fs.rmSync(troot, { recursive: true, force: true });
});

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
