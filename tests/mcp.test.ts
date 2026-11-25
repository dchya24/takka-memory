import { afterEach, beforeEach, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp/server.js";

let root: string;
let client: Client;
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
	expect(tools.map((t) => t.name).sort()).toEqual([
		"memory_delete",
		"memory_list",
		"memory_read",
		"memory_search",
		"memory_write",
	]);
});

it("exposes no deprecated zcode_* aliases", async () => {
	const { tools } = await client.listTools();
	expect(tools.map((t) => t.name).filter((n) => n.startsWith("zcode_"))).toEqual([]);
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

it("memory_search honours the limit parameter", async () => {
	for (let i = 0; i < 6; i++) {
		await client.callTool({ name: "memory_write", arguments: { name: `s-${i}`, description: "needle", type: "user", body: "needle" } });
	}
	const res = await client.callTool({ name: "memory_search", arguments: { query: "needle", limit: 2 } });
	expect(res.content?.[0]?.text?.split("\n").filter(Boolean)).toHaveLength(2);
});

it("rejects an out-of-range limit", async () => {
	const res = await client.callTool({ name: "memory_search", arguments: { query: "x", limit: 500 } });
	expect(res.isError).toBe(true);
});
