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
	it("accepts top-level type as well as nested metadata.type", () => {
		expect(parseFrontmatter("---\nname: a\ntype: reference\n---\n").type).toBe("reference");
	});
	it("handles CRLF line endings", () => {
		const md = "---\r\nname: crlf\r\ndescription: Windows file\r\nmetadata:\r\n  type: user\r\n---\r\n\r\nbody";
		expect(parseFrontmatter(md)).toEqual({ name: "crlf", description: "Windows file", type: "user" });
	});
	it("unquotes quoted scalars", () => {
		const md = '---\nname: q\ndescription: "Uses: colon and # hash"\nmetadata:\n  type: user\n---\n';
		expect(parseFrontmatter(md).description).toBe("Uses: colon and # hash");
	});
	it("treats ' #' as a YAML comment in a bare scalar", () => {
		expect(parseFrontmatter("---\nname: c\ndescription: plain value # a comment\n---\n").description).toBe("plain value");
	});
	it("keeps a '#' that is not comment-shaped inside a quoted scalar", () => {
		const md = '---\nname: c\ndescription: "issue #42 tracker"\n---\n';
		expect(parseFrontmatter(md).description).toBe("issue #42 tracker");
	});
	it("round-trips a description containing '#' (quoted on write)", () => {
		const desc = "issue #42 tracker";
		const md = buildMemoryFile({ name: "x", description: desc, type: "user", body: "b" });
		expect(parseFrontmatter(md).description).toBe(desc);
	});
	it("ignores unknown keys", () => {
		const md = "---\nname: u\ndescription: d\nauthor: someone\nmetadata:\n  type: user\n---\n";
		expect(parseFrontmatter(md)).toEqual({ name: "u", description: "d", type: "user" });
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
	it("quotes a description containing a colon and survives a round-trip", () => {
		const desc = "User prefers: SSH over HTTPS";
		const md = buildMemoryFile({ name: "x", description: desc, type: "user", body: "b" });
		expect(parseFrontmatter(md).description).toBe(desc);
	});
	it("round-trips an empty description", () => {
		const md = buildMemoryFile({ name: "x", description: "", type: "user", body: "b" });
		expect(parseFrontmatter(md).description).toBe("");
	});
});
