import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

export type Scope = "global" | "project";

export function memoryRoot(): string {
	return process.env.TAKKA_MEMORY_ROOT || path.join(os.homedir(), ".takka", "memory");
}

/** `<basename(cwd)>-<sha256(cwd)[0..16]>` — same scheme the old zcode bridge used, so zcode stores migrate 1:1. */
export function projectKeyFor(cwd: string): string {
	const base = path.basename(cwd);
	const hash = crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 16);
	return `${base}-${hash}`;
}

export function scopeDir(scope: Scope, cwd: string): string {
	if (scope === "global") return memoryRoot();
	return path.join(memoryRoot(), "projects", projectKeyFor(cwd));
}
