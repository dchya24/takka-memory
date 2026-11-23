import type { MemoryInfo, ReadResult, SearchResult } from "../core/store.js";

export function formatList(infos: MemoryInfo[]): string {
	if (!infos.length) {
		return 'No memories yet. Create one with memory_write (scope defaults to "project"; pass scope:"global" for cross-project facts).';
	}
	return infos
		.map((i) => `- ${i.name} [${i.scope}] [${i.type || "?"}] ${i.description || "(no description)"}`)
		.join("\n");
}

export function formatSearch(results: SearchResult[], query: string): string {
	if (!results.length) return `No matches for '${query}'.`;
	return results.map((r) => `[${r.scope}] ${r.file}:${r.line}: ${r.text}`).join("\n");
}

export function formatRead(r: ReadResult): string {
	return `[${r.scope}] ${r.path}\n\n${r.content}`;
}
