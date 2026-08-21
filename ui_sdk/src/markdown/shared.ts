import { CrepeBuilder } from "@milkdown/crepe/builder";
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { latex } from "@milkdown/crepe/feature/latex";
import {
	editorViewCtx,
	editorViewOptionsCtx,
	parserCtx,
} from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { imageDirectivesSchema } from "./image-directives";
import {
	diagramNodeView,
	diagramSchema,
	insertDiagramInputRule,
	remarkMermaidPlugin,
} from "./plugins/mermaid";

export interface MarkdownEditorConfig {
	root?: Node | string | null;
	defaultValue?: string;
	mode?: "edit" | "render";
	onUpload?: (file: File) => Promise<string>;
}

/**
 * Replace the editor document with freshly-parsed markdown. Used by the
 * source-mode toggle (`setMarkdown` on the editor handle) and by the
 * hidden renderer.
 */
export function setMarkdownContent(markdown: string) {
	return (ctx: Ctx) => {
		const parser = ctx.get(parserCtx);
		const view = ctx.get(editorViewCtx);
		const doc = parser(markdown);
		const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc);
		tr.setMeta("addToHistory", false);
		view.dispatch(tr);
	};
}

/**
 * Shared editor builder. The renderer is the same editor in `render` mode,
 * so the schema (nodes, marks, remark transforms) is identical for editing
 * and for `getHTML()` export.
 *
 * This builds the document schema only. Edit-mode UI chrome (toolbar,
 * block-edit, tooltips, list-item, cursor, placeholder, table, link-tooltip)
 * is composed on top by the editing host (see MilkdownEditor) so the schema
 * stays the single source of truth for both editing and rendering.
 */
export function createMarkdownEditor(
	config: MarkdownEditorConfig,
): CrepeBuilder {
	const { root, defaultValue, mode = "edit", onUpload } = config;

	const builder = new CrepeBuilder({ root, defaultValue });

	// codeMirror must be registered before latex (the Latex feature requires it).
	builder.addFeature(codeMirror);
	builder.addFeature(latex);

	builder.editor
		.config((ctx) => {
			ctx.update(editorViewOptionsCtx, (prev) => ({
				...prev,
				editable: () => mode === "edit",
				attributes: { ...prev?.attributes, spellcheck: "false" },
			}));
		})
		.use(remarkMermaidPlugin)
		.use(diagramSchema)
		.use(diagramNodeView)
		.use(insertDiagramInputRule)
		.use(imageDirectivesSchema);

	return builder;
}
