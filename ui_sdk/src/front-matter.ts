/**
 * Minimal YAML front-matter support (Jekyll/Hugo/Obsidian style). Parses a
 * practical YAML subset — quoted/unquoted scalars, inline arrays, booleans,
 * numbers, and `#` comments — into a plain object and returns the body with
 * the front-matter block removed. Documents without a leading front-matter
 * block pass through unchanged.
 */

export interface FrontMatter {
	data: Record<string, unknown>;
	content: string;
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseFrontMatter(markdown: string): FrontMatter {
	const match = FRONT_MATTER_RE.exec(markdown);

	if (match === null) {
		return { data: {}, content: markdown };
	}

	return {
		data: parseYamlLines(match[1]),
		content: markdown.slice(match[0].length),
	};
}

function parseYamlLines(block: string): Record<string, unknown> {
	const data: Record<string, unknown> = {};

	for (const line of block.split(/\r?\n/)) {
		const trimmed = line.trim();

		if (trimmed === "" || trimmed.startsWith("#")) {
			continue;
		}

		const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);

		if (match === null) {
			continue;
		}

		data[match[1]] = parseScalar(match[2]);
	}

	return data;
}

function parseScalar(raw: string): unknown {
	const value = raw.trim();

	if (value === "") {
		return null;
	}

	if (value.startsWith("[") && value.endsWith("]")) {
		return value
			.slice(1, -1)
			.split(",")
			.map((item) => parseScalar(item))
			.filter((item) => item !== null);
	}

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	if (value === "true") {
		return true;
	}

	if (value === "false") {
		return false;
	}

	if (/^-?\d+(?:\.\d+)?$/.test(value)) {
		return Number(value);
	}

	return value.split(/\s+#/)[0].trim();
}
