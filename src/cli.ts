import * as os from "node:os";
import * as path from "node:path";
import { importZcode } from "./core/import-zcode.js";
import { memoryRoot, scopeDir, type Scope } from "./core/paths.js";
import { listMemories, readMemory, searchMemories } from "./core/store.js";
import { formatList, formatRead, formatSearch } from "./adapters/format.js";

const USAGE = `takka-memory — agent-agnostic persistent memory

Usage: takka-memory <command>
  mcp                                  Start the MCP stdio server
  list [global|project]                List memories (both scopes if omitted)
  read <name>                          Read one memory (project wins over global)
  search [--limit N] <query...>        Case-insensitive text search (max N hits, 1-200)
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
				const args = [...rest];
				let limit: number | undefined;
				const li = args.indexOf("--limit");
				if (li >= 0) {
					limit = Number.parseInt(args[li + 1], 10);
					if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 200)
						throw new Error("invalid --limit (use 1-200)");
					args.splice(li, 2);
				}
				const query = args.join(" ").trim();
				if (!query) throw new Error("usage: takka-memory search [--limit N] <query...>");
				console.log(formatSearch(searchMemories(cwd, query, undefined, { limit }), query));
				return 0;
			}
			case "path": {
				console.log(`root:    ${memoryRoot()}`);
				console.log(`project: ${scopeDir("project", cwd)}`);
				return 0;
			}
			case "import-zcode": {
				const dryRun = rest.includes("--dry-run");
				const zrFlag = rest.indexOf("--zcode-root");
				const zcodeRoot =
					zrFlag >= 0 && zrFlag + 1 < rest.length
						? rest[zrFlag + 1]
						: path.join(os.homedir(), ".zcode", "cli", "memories", "projects");
				const s = importZcode(zcodeRoot, memoryRoot(), dryRun);
				for (const p of s.projects) {
					console.log(`${p.key}: copied ${p.copied}, skipped ${p.skipped}, updated ${p.updated}${dryRun ? " (dry-run)" : ""}`);
				}
				console.log(
					`total: copied ${s.total.copied}, skipped ${s.total.skipped}, updated ${s.total.updated}${s.projects.length === 0 ? " (no zcode project memories found)" : ""}`,
				);
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
