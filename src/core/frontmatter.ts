export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryFrontmatter {
	name: string;
	description: string;
	type: string;
}

export function parseFrontmatter(md: string): MemoryFrontmatter {
	const result: MemoryFrontmatter = { name: "", description: "", type: "" };
	const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(md);
	if (!m) return result;
	for (const rawLine of m[1].split("\n")) {
		const line = rawLine.replace(/\r$/, "");
		const kv = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
		if (!kv) continue;
		const key = kv[1].toLowerCase();
		const value = parseScalar(kv[2].trim());
		if (key === "name" && !result.name) result.name = value;
		else if (key === "description" && !result.description) result.description = value;
		// `type:` may appear as `metadata: type: x` child or top-level `type: x` — accept either.
		else if (key === "type" && !result.type) result.type = value.split(/\s+/)[0];
	}
	return result;
}

/** Parse one YAML-ish scalar: double/single-quoted (with escapes) or bare (trailing `# comment` stripped). */
function parseScalar(v: string): string {
	if (!v) return "";
	const q = v[0];
	if (q === '"' || q === "'") {
		let out = "";
		for (let i = 1; i < v.length; i++) {
			const c = v[i];
			if (q === '"' && c === "\\" && i + 1 < v.length) {
				const n = v[++i];
				if (n === "n") out += "\n";
				else if (n === "t") out += "\t";
				else if (n === "r") out += "\r";
				else out += n;
			} else if (q === "'" && c === "'" && v[i + 1] === "'") {
				out += "'";
				i++;
			} else if (c === q) {
				return out; // closing quote — ignore anything after (e.g. trailing comment)
			} else {
				out += c;
			}
		}
		return out; // unterminated quote — return what we got
	}
	const hash = v.indexOf(" #");
	if (hash >= 0) v = v.slice(0, hash).trim();
	return v;
}

/** Quote a scalar for frontmatter output when bare form would be ambiguous. */
function formatScalar(v: string): string {
	if (v === "") return '""';
	if (/^[A-Za-z0-9][A-Za-z0-9 _@./+:-]*$/.test(v) && !v.includes(": ") && !v.includes(" #") && !/\s$/.test(v)) return v;
	return JSON.stringify(v);
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
		`description: ${formatScalar(oneLine)}`,
		"metadata:",
		`  type: ${input.type}`,
		"---",
		"",
		input.body.trim(),
		"",
	].join("\n");
}
