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
