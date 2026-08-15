import { resolveVideo } from '@/components/markdown/video'
import { cn } from '@/lib/utils'

export interface BuildVideoElementOptions {
  src: string
  alt: string
  autoplay: boolean
  width: number | null
  height: number | null
  className?: string
}

/**
 * Build a `<video>` or `<iframe>` player DOM element for a video URL, matching
 * the article render (`convertVideoImages` in postprocess.ts). Returns null
 * when `src` is not a recognized video source. Shared by the article
 * post-processor and the editor's image node view so both stay in sync.
 */
export function buildVideoElement(options: BuildVideoElementOptions): HTMLElement | null {
  const video = resolveVideo(options.src)

  if (video === null) {
    return null
  }

  let el: HTMLVideoElement | HTMLIFrameElement

  if (video.kind === 'file') {
    const v = document.createElement('video')
    v.controls = true
    v.preload = 'metadata'
    v.src = video.src
    v.title = options.alt
    el = v
  } else {
    const iframe = document.createElement('iframe')
    iframe.src =
      video.kind === 'bilibili'
        ? `${video.src}&autoplay=${options.autoplay ? '1' : '0'}`
        : video.src
    iframe.title = options.alt || 'Embedded video'
    iframe.allowFullscreen = true
    iframe.loading = 'lazy'
    el = iframe
  }

  el.className = cn(
    'my-6 mx-auto block max-h-[75vh] w-full rounded-xl bg-black',
    options.className,
  )
  if (options.width != null) el.style.maxWidth = `${options.width}px`
  if (options.height != null) el.style.maxHeight = `${options.height}px`

  return el
}
