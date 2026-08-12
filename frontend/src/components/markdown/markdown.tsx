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

import 'katex/dist/katex.min.css'

import { Mermaid } from './mermaid'
import { Check, Copy } from 'lucide-react'

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
  return (
    <img
      src={props.src}
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
        {content}
      </ReactMarkdown>
    </div>
  )
}
