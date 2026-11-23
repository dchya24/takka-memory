import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildInjection, makeHandlers } from "../src/adapters/pi.js";
import { writeMemory } from "../src/core/store.js";

let root: string;
const CWD = process.cwd(); // handlers resolve the project scope from cwd, like the real adapter
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
	it("write defaults to project and reports scope", async () => {
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
