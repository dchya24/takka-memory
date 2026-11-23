export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryFrontmatter {
	name: string;
	description: string;
	type: string;
}

export function parseFrontmatter(md: string): MemoryFrontmatter {
	const result: MemoryFrontmatter = { name: "", description: "", type: "" };
	const m = /^---\n([\s\S]*?)\n---/.exec(md);
	if (!m) return result;
	for (const line of m[1].split("\n")) {
		let dm = /^name:\s*(.+)$/.exec(line);
		if (dm) result.name = dm[1].trim();
		dm = /^description:\s*(.+)$/.exec(line);
		if (dm) result.description = dm[1].trim();
		dm = /^\s*type:\s*(\S+)/.exec(line);
		if (dm) result.type = dm[1].trim();
	}
	return result;
}

export function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/\.md$/, "")
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "memory";
}

export function buildMemoryFile(input: {
	name: string;
	description: string;
	type: MemoryType;
	body: string;
}): string {
	const slug = slugify(input.name);
	const oneLine = input.description.replace(/\s*\n\s*/g, " ").trim();
	return [
		"---",
		`name: ${slug}`,
		`description: ${oneLine}`,
		"metadata:",
		`  type: ${input.type}`,
		"---",
		"",
		input.body.trim(),
		"",
	].join("\n");
}
