import { memo, useEffect, useState } from "react";
import type { MouseEvent, Ref } from "react";
import { copyText } from "../api";
import { parseFrontMatter } from "../front-matter";
import { type MermaidTheme, setMermaidTheme } from "./mermaid";
import { postProcessHtml } from "./postprocess";
import { markdownToHtml } from "./render";

export type MarkdownViewTheme = MermaidTheme | "system";

export interface MarkdownViewProps {
	content: string;
	className?: string;
	containerRef?: Ref<HTMLDivElement>;
	theme?: MarkdownViewTheme;
}

/**
 * Render markdown to HTML using the same schema as the editor. `theme`
 * ('light' | 'dark') selects the mermaid theme; pass 'system' to resolve
 * from the user's prefers-color-scheme at render time.
 */
export const MarkdownView = memo(function MarkdownView({
	content,
	className,
	containerRef,
	theme = "system",
}: MarkdownViewProps) {
	const [html, setHtml] = useState("");

	const resolved: MermaidTheme =
		theme === "system"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light"
			: theme;

	useEffect(() => {
		setMermaidTheme(resolved);
	}, [resolved]);

	useEffect(() => {
		let cancelled = false;
		const body = parseFrontMatter(content).content;

		markdownToHtml(body)
			.then(postProcessHtml)
			.then((next) => {
				if (!cancelled) {
					setHtml(next);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setHtml("");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [content, resolved]);

	const onCopyClick = async (
		event: MouseEvent<HTMLDivElement>,
	): Promise<void> => {
		const target = event.target as HTMLElement;

		if (!target.classList.contains("md-copy")) {
			return;
		}

		const shell = target.closest(".md-codeblock");
		const code = shell?.querySelector("pre");
		if (code != null) {
			await copyText(code.textContent ?? "");
		}
	};

	return (
		<div
			ref={containerRef}
			className={className}
			onClick={onCopyClick}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
});
