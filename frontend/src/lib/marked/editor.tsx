import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { CrepeBuilder } from '@milkdown/crepe/builder'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { setMermaidTheme, type MermaidTheme } from './mermaid'
import { escapeTableCodePipes } from './preprocess'
import { createMarkdownEditor, setMarkdownContent } from './shared'

export interface MilkdownEditorHandle {
  getMarkdown: () => string
  setMarkdown: (markdown: string) => void
}

export interface MilkdownEditorProps {
  defaultValue?: string
  onUpload?: (file: File) => Promise<string>
  className?: string
}

export const MilkdownEditor = forwardRef<
  MilkdownEditorHandle,
  MilkdownEditorProps
>(function MilkdownEditor({ defaultValue = '', onUpload, className }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const builderRef = useRef<CrepeBuilder | null>(null)
  const { theme } = useTheme()

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => builderRef.current?.getMarkdown() ?? '',
      setMarkdown: (markdown: string) => {
        builderRef.current?.editor.action(
          setMarkdownContent(escapeTableCodePipes(markdown)),
        )
      },
    }),
    [],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const builder = createMarkdownEditor({
      root: container,
      defaultValue,
      mode: 'edit',
      onUpload,
    })
    builderRef.current = builder
    void builder.create()

    return () => {
      builderRef.current = null
      void builder.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resolved: MermaidTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme

  useEffect(() => {
    setMermaidTheme(resolved)
  }, [resolved])

  return (
    <div
      ref={containerRef}
      className={cn('milkdown-editor', resolved === 'dark' && 'dark', className)}
    />
  )
})
