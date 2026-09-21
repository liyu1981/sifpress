import * as markdown from '../markdown';
import { Milkdown } from '../milkdown-globals';

const w = window as unknown as {
  SifpressUI?: { Libs?: Record<string, unknown>; Milkdown?: unknown };
};

w.SifpressUI = w.SifpressUI ?? {};
w.SifpressUI.Libs = w.SifpressUI.Libs ?? {};
w.SifpressUI.Milkdown = Milkdown;
w.SifpressUI.Libs.markdown = {
  MarkdownView: markdown.MarkdownView,
  markdownToHtml: markdown.markdownToHtml,
  postProcessHtml: markdown.postProcessHtml,
  createMarkdownEditor: markdown.createMarkdownEditor,
  setMarkdownContent: markdown.setMarkdownContent,
  setMermaidTheme: markdown.setMermaidTheme,
};

export default markdown;
