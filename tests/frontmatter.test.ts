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
