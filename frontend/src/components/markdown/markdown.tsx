import { cloneElement, isValidElement, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { cn } from '@/lib/utils'
import { remarkImageDirectives } from '@/lib/markdown/image-directives'
import { parseFrontMatter } from '@/lib/front-matter'

import 'katex/dist/katex.min.css'

import { Mermaid } from './mermaid'
import { VideoEmbed, isVideoSource } from './video'
import { Check, Copy } from 'lucide-react'

/**
 * micromark-extension-gfm-table treats every `|` in a row as a cell
 * divider and has no code-span awareness, so a cell like `` `|640` ``
 * splits into three broken columns. This preprocessor escapes pipes
 * that sit inside backtick code spans within table rows (`\|`), which
 * the table parser handles and re-renders as a literal pipe inside the
 * code span. Non-table content is never touched.
 */
function escapeTableCodePipes(source: string): string {
  const lines = source.split('\n')
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }

    if (inFence || !line.includes('|')) {
      continue
    }

    if (!isTableDelimiterRow(line)) {
      continue
    }

    let start = i
    while (start > 0 && lines[start - 1].trim() !== '' && lines[start - 1].includes('|')) {
      start--
    }

    let end = i + 1
    while (end < lines.length && lines[end].trim() !== '' && lines[end].includes('|')) {
      end++
    }

    for (let j = start; j < end; j++) {
      lines[j] = escapePipesInCodeSpans(lines[j])
    }

    i = end - 1
  }

  return lines.join('\n')
}

function isTableDelimiterRow(line: string): boolean {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = body.split('|').map((cell) => cell.trim())

  return cells.length >= 2 && cells.every((cell) => /^:?-+:?$/.test(cell))
}

function escapePipesInCodeSpans(line: string): string {
  let out = ''
  let delimiter = 0
  let i = 0

  while (i < line.length) {
    const char = line[i]

    if (char === '`') {
      let run = 0
      while (i + run < line.length && line[i + run] === '`') {
        run++
      }
      if (delimiter === 0) {
        delimiter = run
      } else if (run === delimiter) {
        delimiter = 0
      }
      out += '`'.repeat(run)
      i += run
      continue
    }

    if (delimiter !== 0 && char === '|') {
      out += '\\|'
      i++
      continue
    }

    out += char
    i++
  }

  return out
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(extractText).join('')
  }

  if (isValidElement(node)) {
    return extractText((node.props as { children?: ReactNode }).children)
  }

  return ''
}

function ImageComponent(props: React.ComponentProps<'img'> & ExtraProps) {
  const src = props.src

  if (typeof src === 'string' && isVideoSource(src)) {
    return (
      <VideoEmbed
        src={src}
        alt={props.alt}
        width={props.width}
        height={props.height}
        className={props.className}
      />
    )
  }

  return (
    <img
      src={src}
      alt={props.alt ?? ''}
      width={props.width}
      height={props.height}
      className={cn('rounded-lg', props.className)}
      loading="lazy"
      decoding="async"
    />
  )
}

function Paragraph(props: React.ComponentProps<'p'> & ExtraProps) {
  const children = props.children
  const only = Array.isArray(children) ? children[0] : children

  if (isValidElement(only)) {
    const imgProps = only.props as {
      src?: unknown
      alt?: unknown
      className?: unknown
    }

    if ('src' in imgProps) {
      const className = typeof imgProps.className === 'string' ? imgProps.className : ''
      const positionClass = className
        .split(/\s+/)
        .filter((c) => c.startsWith('md-img-'))
        .join(' ')
      const alt =
        typeof imgProps.alt === 'string' && imgProps.alt !== ''
          ? imgProps.alt
          : undefined
      const clean = cloneElement(only as ReactElement<Record<string, unknown>>, {
        className:
          className.replace(/\bmd-img-(?:float-left|float-right|center)\b/g, '').trim() ||
          undefined,
      })

      return (
        <figure className={positionClass || undefined}>
          {clean}
          {alt !== undefined && <figcaption>{alt}</figcaption>}
        </figure>
      )
    }
  }

  return <p>{children}</p>
}

function Anchor(props: React.ComponentProps<'a'> & ExtraProps) {
  const external =
    typeof props.href === 'string' && /^https?:\/\//.test(props.href)

  return (
    <a
      href={props.href}
      className={props.className}
      title={props.title}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {props.children}
    </a>
  )
}

function CodeBlock(props: React.ComponentProps<'code'> & ExtraProps) {
  const { node: _node, className, children } = props

  return (
    <code className={className}>
      {children}
    </code>
  )
}

function PreBlock(props: React.ComponentProps<'pre'> & ExtraProps) {
  const { children } = props
  const child = Array.isArray(children) ? children[0] : children

  if (!isValidElement(child)) {
    return <pre>{children}</pre>
  }

  const childProps = child.props as {
    className?: unknown
    children?: ReactNode
  }
  const cls = typeof childProps.className === 'string' ? childProps.className : ''
  const [copied, setCopied] = useState(false)

  if (/\blanguage-mermaid\b/.test(cls)) {
    return <Mermaid chart={extractText(childProps.children).replace(/\n$/, '')} />
  }

  const langMatch = /\blanguage-([\w+-]+)/.exec(cls)
  const lang = langMatch ? langMatch[1] : 'text'

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        extractText(childProps.children).replace(/\n$/, ''),
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable; keep the button idle.
    }
  }

  return (
    <div className="md-codeblock my-6 overflow-hidden rounded-xl border bg-muted/40">
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{lang}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="!my-0 overflow-x-auto !bg-transparent !p-4">
        <code className={cls}>{childProps.children}</code>
      </pre>
    </div>
  )
}

const components: Components = {
  p: Paragraph,
  pre: PreBlock,
  code: CodeBlock,
  img: ImageComponent,
  a: Anchor,
}

export function Markdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkImageDirectives]}
        rehypePlugins={[
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: 'wrap' }],
          rehypeKatex,
          rehypeHighlight,
        ]}
        components={components}
      >
        {escapeTableCodePipes(parseFrontMatter(content).content)}
      </ReactMarkdown>
    </div>
  )
}
