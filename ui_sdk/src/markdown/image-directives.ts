import { imageSchema } from "@milkdown/kit/preset/commonmark";

const SIZE_PATTERN = /^(\d*)x(\d*)$|^(\d+)$/;

const POSITION_CLASS: Record<string, string> = {
	left: "left",
	right: "right",
	center: "center",
	"float-left": "float-left",
	"float-right": "float-right",
};

const LINK_DIRECTIVES = new Set(["link", "noembed"]);
const AUTOPLAY_DIRECTIVES = new Set(["autoplay"]);

interface ParsedImageDirectives {
	caption: string;
	width: number | null;
	height: number | null;
	position: string | null;
	asLink: boolean;
	autoplay: boolean;
}

function parseImageDirectives(alt: string): ParsedImageDirectives {
	const parts = alt.split("|");
	const caption: string[] = [];
	let width: number | null = null;
	let height: number | null = null;
	let position: string | null = null;
	let asLink = false;
	let autoplay = false;

	for (const part of parts) {
		const size = SIZE_PATTERN.exec(part);

		if (size) {
			if (size[3] !== undefined) {
				width = Number(size[3]);
			} else {
				if (size[1] !== "") width = Number(size[1]);
				if (size[2] !== "") height = Number(size[2]);
			}
			continue;
		}

		const positionClass = POSITION_CLASS[part];

		if (positionClass !== undefined) {
			position = positionClass;
			continue;
		}

		if (LINK_DIRECTIVES.has(part)) {
			asLink = true;
			continue;
		}

		if (AUTOPLAY_DIRECTIVES.has(part)) {
			autoplay = true;
			continue;
		}

		caption.push(part);
	}

	return {
		caption: caption.join("|"),
		width,
		height,
		position,
		asLink,
		autoplay,
	};
}

export interface ImageDirectiveAttrs {
	src: string;
	alt: string;
	title: string;
	width: number | null;
	height: number | null;
	position: string | null;
	asLink: boolean;
	autoplay: boolean;
}

export function rebuildImageAlt(attrs: {
	alt: string;
	width: number | null;
	height: number | null;
	position: string | null;
	asLink: boolean;
	autoplay: boolean;
}): string {
	const parts: string[] = [];

	if (attrs.alt !== "") {
		parts.push(attrs.alt);
	}

	if (attrs.width !== null && attrs.height !== null) {
		parts.push(`${attrs.width}x${attrs.height}`);
	} else if (attrs.width !== null) {
		parts.push(String(attrs.width));
	} else if (attrs.height !== null) {
		parts.push(`x${attrs.height}`);
	}

	if (attrs.position !== null) {
		parts.push(attrs.position);
	}

	if (attrs.asLink) {
		parts.push("link");
	}

	if (attrs.autoplay) {
		parts.push("autoplay");
	}

	return parts.join("|");
}

export const imageDirectivesSchema = imageSchema.extendSchema(
	(prev) => (ctx) => {
		const base = prev(ctx);

		return {
			...base,
			attrs: {
				...base.attrs,
				width: { default: null },
				height: { default: null },
				position: { default: null },
				asLink: { default: false },
				autoplay: { default: false },
			},
			parseMarkdown: {
				match: base.parseMarkdown.match,
				runner: (state, node, type) => {
					const directives = parseImageDirectives((node.alt as string) ?? "");
					state.addNode(type, {
						src: (node.url as string) ?? "",
						alt: directives.caption,
						title: (node.title as string) ?? "",
						width: directives.width,
						height: directives.height,
						position: directives.position,
						asLink: directives.asLink,
						autoplay: directives.autoplay,
					});
				},
			},
			toMarkdown: {
				match: base.toMarkdown.match,
				runner: (state, node) => {
					state.addNode("image", undefined, undefined, {
						title: node.attrs.title,
						url: node.attrs.src,
						alt: rebuildImageAlt(
							node.attrs as unknown as {
								alt: string;
								width: number | null;
								height: number | null;
								position: string | null;
								asLink: boolean;
								autoplay: boolean;
							},
						),
					});
				},
			},
			toDOM: (node) => {
				const attrs = node.attrs;

				if (attrs.asLink) {
					return [
						"a",
						{ href: attrs.src, class: "md-img-link" },
						(attrs.alt as string) || (attrs.src as string),
					];
				}

				const domAttrs: Record<string, string> = {
					src: attrs.src,
					alt: attrs.alt ?? "",
				};

				if (attrs.title) domAttrs.title = attrs.title;
				if (attrs.width != null) domAttrs.width = String(attrs.width);
				if (attrs.height != null) domAttrs.height = String(attrs.height);
				if (attrs.autoplay) domAttrs["data-autoplay"] = "true";

				const classes: string[] = [];
				if (attrs.position) classes.push(`md-img-${attrs.position}`);
				if (classes.length > 0) domAttrs.class = classes.join(" ");

				return ["img", domAttrs];
			},
		};
	},
);
