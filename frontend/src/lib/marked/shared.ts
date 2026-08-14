import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx, editorViewOptionsCtx, parserCtx } from '@milkdown/kit/core'
import { CrepeBuilder } from '@milkdown/crepe/builder'
import { blockEdit } from '@milkdown/crepe/feature/block-edit'
import { codeMirror } from '@milkdown/crepe/feature/code-mirror'
import { cursor } from '@milkdown/crepe/feature/cursor'
import { latex } from '@milkdown/crepe/feature/latex'
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip'
import { listItem } from '@milkdown/crepe/feature/list-item'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { table } from '@milkdown/crepe/feature/table'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import { imageDirectivesSchema } from './plugins/image-directives'
import {
  diagramNodeView,
  diagramSchema,
  insertDiagramInputRule,
  remarkMermaidPlugin,
} from './plugins/mermaid'
import { imageDirectivesView } from './plugins/image-directives-view'
import {
  configureImageDirectiveTooltip,
  imageDirectiveTooltip,
} from './plugins/image-directives-tooltip'

export interface MarkdownEditorConfig {
  root?: Node | string | null
  defaultValue?: string
  mode?: 'edit' | 'render'
  onUpload?: (file: File) => Promise<string>
}

/**
 * Replace the editor document with freshly-parsed markdown. Used by the
 * source-mode toggle (`setMarkdown` on the editor handle) and by the
 * hidden renderer.
 */
export function setMarkdownContent(markdown: string) {
  return (ctx: Ctx) => {
    const parser = ctx.get(parserCtx)
    const view = ctx.get(editorViewCtx)
    const doc = parser(markdown)
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc)
    tr.setMeta('addToHistory', false)
    view.dispatch(tr)
  }
}

/**
 * Shared editor builder. The renderer is the same editor in `render` mode,
 * so the schema (nodes, marks, remark transforms) is identical for editing
 * and for `getHTML()` export.
 */
export function createMarkdownEditor(config: MarkdownEditorConfig): CrepeBuilder {
  const { root, defaultValue, mode = 'edit', onUpload } = config

  const builder = new CrepeBuilder({ root, defaultValue })

  // codeMirror must be registered before latex (the Latex feature requires it).
  builder.addFeature(codeMirror)

  if (mode === 'edit') {
    builder.addFeature(listItem)
    builder.addFeature(linkTooltip)
    builder.addFeature(cursor)
    builder.addFeature(placeholder)
    builder.addFeature(table)
    builder.addFeature(toolbar)
    builder.addFeature(blockEdit)
  }

  builder.addFeature(latex)

  builder.editor
    .config((ctx) => {
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        editable: () => mode === 'edit',
        attributes: { ...prev?.attributes, spellcheck: 'false' },
      }))
    })
    .use(remarkMermaidPlugin)
    .use(diagramSchema)
    .use(diagramNodeView)
    .use(insertDiagramInputRule)
    .use(imageDirectivesSchema)

  if (mode === 'edit') {
    builder.editor
      .use(imageDirectivesView)
      .config(configureImageDirectiveTooltip(onUpload))
      .use(imageDirectiveTooltip)
  }

  return builder
}
