import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectImport {
	key: string;
	copied: number;
	skipped: number;
	updated: number;
}
export interface ImportSummary {
	projects: ProjectImport[];
	total: { copied: number; skipped: number; updated: number };
}

/**
 * One-shot migration from a zcode CLI memory store:
 *   <zcodeRoot>/<project-key>/memory/<file>.md  →  <takkaRoot>/projects/<project-key>/<file>.md
 * Non-destructive: per file — identical target → skipped, missing → copied,
 * differing → overwritten (zcode store is migration source of truth).
 * `dryRun` computes the same summary without writing anything.
 */
export function importZcode(zcodeRoot: string, takkaRoot: string, dryRun: boolean): ImportSummary {
	const projects: ProjectImport[] = [];
	const total = { copied: 0, skipped: 0, updated: 0 };
	if (!fs.existsSync(zcodeRoot)) return { projects, total };
	for (const key of fs.readdirSync(zcodeRoot).sort()) {
		const srcDir = path.join(zcodeRoot, key, "memory");
		if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) continue;
		const dstDir = path.join(takkaRoot, "projects", key);
		const stat: ProjectImport = { key, copied: 0, skipped: 0, updated: 0 };
		for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort()) {
			const src = path.join(srcDir, f);
			const dst = path.join(dstDir, f);
			const srcContent = fs.readFileSync(src, "utf-8");
			if (fs.existsSync(dst) && fs.readFileSync(dst, "utf-8") === srcContent) {
				stat.skipped++;
			} else {
				const existed = fs.existsSync(dst);
				if (!dryRun) {
					fs.mkdirSync(dstDir, { recursive: true });
					fs.writeFileSync(dst, srcContent, "utf-8");
				}
				if (existed) stat.updated++;
				else stat.copied++;
			}
		}
		projects.push(stat);
		total.copied += stat.copied;
		total.skipped += stat.skipped;
		total.updated += stat.updated;
	}
	return { projects, total };
}
