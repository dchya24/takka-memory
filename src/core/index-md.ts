import * as fs from "node:fs";
import * as path from "node:path";
import { atomicWriteFileSync, readFileSafe, withDirLockSync } from "./fsutil.js";

export interface IndexEntry {
	title: string;
	file: string;
	hook: string;
	line: string;
}

const INDEX_LINE = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)\s*[—–-]\s*(.*)$/;

export function parseIndex(md: string): IndexEntry[] {
	const entries: IndexEntry[] = [];
	for (const line of md.split("\n")) {
		const m = INDEX_LINE.exec(line);
		if (m) entries.push({ title: m[1].trim(), file: m[2].trim(), hook: m[3].trim(), line });
	}
	return entries;
}

function indexFile(dir: string): string {
	return path.join(dir, "MEMORY.md");
}

/** Index update assuming the caller already holds the dir lock (see withDirLockSync). */
export function upsertIndexLineLocked(dir: string, file: string, title: string, hook: string): void {
	const filePath = indexFile(dir);
	let md = readFileSafe(filePath);
	if (md === null) md = "# Memory Index\n";
	const oneLineHook = hook.replace(/\s+/g, " ").trim();
	const newLine = `- [${title}](${file}) — ${oneLineHook}`;
	const lines = md.split("\n");
	let replaced = false;
	for (let i = 0; i < lines.length; i++) {
		const m = INDEX_LINE.exec(lines[i]);
		if (m && m[2].trim() === file) {
			lines[i] = newLine;
			replaced = true;
			break;
		}
	}
	if (!replaced) {
		if (!md.endsWith("\n")) md += "\n";
		atomicWriteFileSync(filePath, md + newLine + "\n");
	} else {
		atomicWriteFileSync(filePath, lines.join("\n"));
	}
}

export function upsertIndexLine(dir: string, file: string, title: string, hook: string): void {
	withDirLockSync(dir, () => upsertIndexLineLocked(dir, file, title, hook));
}

/** Index removal assuming the caller already holds the dir lock. */
export function removeFromIndexLocked(dir: string, file: string): void {
	const md = readFileSafe(indexFile(dir));
	if (md === null) return;
	const lines = md.split("\n").filter((l) => {
		const m = INDEX_LINE.exec(l);
		return !(m && m[2].trim() === file);
	});
	atomicWriteFileSync(indexFile(dir), lines.join("\n"));
}

export function removeFromIndex(dir: string, file: string): void {
	withDirLockSync(dir, () => removeFromIndexLocked(dir, file));
}
