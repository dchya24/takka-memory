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
