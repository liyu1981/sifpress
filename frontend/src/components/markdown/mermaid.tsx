import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme'

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        fontFamily: 'inherit',
      })
      return m.default
    })
  }

  return mermaidPromise
}

let idCounter = 0
const nextId = (): string => `md-mermaid-${++idCounter}`

export function Mermaid({ chart }: { chart: string }) {
  const { theme } = useTheme()
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const idRef = useRef(nextId())

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setError('')

    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          fontFamily: 'inherit',
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
        })

        const { svg: rendered } = await mermaid.render(idRef.current, chart)

        if (!cancelled) setSvg(rendered)
      })
      .catch((cause: unknown) => {
        mermaidPromise = null

        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })

    return () => {
      cancelled = true
    }
  }, [chart, resolvedTheme])

  if (error) {
    return (
      <div className="md-mermaid-error rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="mb-2 text-xs font-medium text-destructive">
          Mermaid render error
        </p>
        <pre className="overflow-x-auto text-xs">
          <code>{chart}</code>
        </pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div
        aria-label="Rendering diagram"
        className="md-mermaid-loading h-24 animate-pulse rounded-lg bg-muted/60"
      />
    )
  }

  return (
    <div
      className="md-mermaid my-6 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
