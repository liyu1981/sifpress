import { resolveVideo } from '@/components/markdown/video'
import { cn } from '@/lib/utils'
import katex from 'katex'
import { nextDiagramId, renderMermaidChart } from './mermaid'

function convertLatexBlocks(body: HTMLElement): void {
  for (const pre of Array.from(body.querySelectorAll('pre'))) {
    const code = pre.querySelector(':scope > code')
    const langMatch = /\blanguage-([\w+-]+)/.exec(code?.className ?? '')

    if (langMatch === null || langMatch[1].toLowerCase() !== 'latex') {
      continue
    }

    const source = code?.textContent ?? ''
    const wrapper = document.createElement('div')
    wrapper.className = 'md-math-display my-6 overflow-x-auto'
    wrapper.innerHTML = katex.renderToString(source, {
      throwOnError: false,
      displayMode: true,
    })
    pre.replaceWith(wrapper)
  }
}

async function renderMermaidDivs(body: HTMLElement): Promise<void> {
  const divs = Array.from(body.querySelectorAll('[data-type="diagram"]'))

  await Promise.all(
    divs.map(async (el) => {
      const chart = el.getAttribute('data-value') ?? el.textContent ?? ''
      const holder = document.createElement('div')
      holder.className = 'md-mermaid my-6 flex justify-center overflow-x-auto'
      el.replaceWith(holder)

      if (chart.trim() === '') {
        return
      }

      try {
        const svg = await renderMermaidChart(chart, nextDiagramId())
        holder.innerHTML = svg
      } catch {
        holder.className =
          'md-mermaid-error my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4'
        const pre = document.createElement('pre')
        pre.className = 'overflow-x-auto text-xs'
        pre.textContent = chart
        holder.appendChild(pre)
      }
    }),
  )
}

function convertVideoImages(body: HTMLElement): void {
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? ''
    const video = resolveVideo(src)

    if (video === null) {
      continue
    }

    const width = img.getAttribute('width')
    const height = img.getAttribute('height')
    const className = img.getAttribute('class') ?? ''
    const alt = img.getAttribute('alt') ?? ''

    let el: HTMLVideoElement | HTMLIFrameElement

    if (video.kind === 'file') {
      const v = document.createElement('video')
      v.controls = true
      v.preload = 'metadata'
      v.src = video.src
      v.title = alt
      el = v
    } else {
      const iframe = document.createElement('iframe')
      iframe.src =
        video.kind === 'bilibili' ? `${video.src}&autoplay=0` : video.src
      iframe.title = alt || 'Embedded video'
      iframe.allowFullscreen = true
      iframe.loading = 'lazy'
      el = iframe
    }

    el.className = cn(
      'my-6 mx-auto block max-h-[75vh] w-full rounded-xl bg-black',
      className,
    )
    if (width !== null) el.style.maxWidth = `${width}px`
    if (height !== null) el.style.maxHeight = `${height}px`
    img.replaceWith(el)
  }
}

function liftLoneImageFigures(body: HTMLElement): void {
  for (const p of Array.from(body.querySelectorAll('p'))) {
    if (p.childNodes.length !== 1) {
      continue
    }

    const media = p.querySelector(':scope > img, :scope > video, :scope > iframe')

    if (media === null) {
      continue
    }

    const caption = media instanceof HTMLImageElement ? media.getAttribute('alt') : null

    const figure = document.createElement('figure')
    p.replaceWith(figure)
    figure.appendChild(media)

    if (caption !== null && caption !== '') {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = caption
      figure.appendChild(figcaption)
    }
  }
}

function externalizeLinks(body: HTMLElement): void {
  for (const a of Array.from(body.querySelectorAll('a'))) {
    const href = a.getAttribute('href') ?? ''

    if (/^https?:\/\//.test(href)) {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    }
  }
}

/**
 * Post-process the `getHTML()` output so it renders the same way the
 * editor (and the old react-markdown pipeline) did: block math → KaTeX
 * display, mermaid divs → SVG, video images → players, lone images →
 * figures with captions, external links → new tab.
 */
export async function postProcessHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body

  convertLatexBlocks(body)
  await renderMermaidDivs(body)
  convertVideoImages(body)
  liftLoneImageFigures(body)
  externalizeLinks(body)

  return body.innerHTML
}
