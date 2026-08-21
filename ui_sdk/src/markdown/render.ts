import type { CrepeBuilder } from "@milkdown/crepe/builder";
import { getHTML } from "@milkdown/kit/utils";
import { escapeTableCodePipes } from "./preprocess";
import { createMarkdownEditor, setMarkdownContent } from "./shared";

let rendererReady: Promise<CrepeBuilder> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getRenderer(): Promise<CrepeBuilder> {
	if (rendererReady !== null) {
		return rendererReady;
	}

	const el = document.createElement("div");
	el.setAttribute("aria-hidden", "true");
	el.style.display = "none";
	document.body.appendChild(el);

	const builder = createMarkdownEditor({
		root: el,
		defaultValue: "",
		mode: "render",
	});

	rendererReady = builder.create().then(() => {
		return builder;
	});

	return rendererReady;
}

/**
 * Render markdown to static HTML via Milkdown's `getHTML()` (shared schema
 * with the editor). Calls are serialized through a promise queue because
 * the hidden renderer instance is a singleton.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
	const builder = await getRenderer();
	const input = escapeTableCodePipes(markdown);

	const run = queue.then(() => {
		builder.editor.action(setMarkdownContent(input));
		const html = builder.editor.action(getHTML());
		return html;
	});

	queue = run.catch(() => undefined);

	return run;
}
