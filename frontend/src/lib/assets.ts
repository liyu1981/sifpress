const THUMB_MAX_EDGE = 400
const THUMB_QUALITY = 0.8

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })
}

/**
 * Draw a source onto a canvas scaled to THUMB_MAX_EDGE, then export as a
 * WebP blob (browsers without WebP encoding silently fall back to PNG).
 * Returns null when canvas is unavailable.
 */
function drawToThumb(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (width <= 0 || height <= 0) {
    return Promise.resolve(null)
  }

  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')

  if (ctx === null) {
    return Promise.resolve(null)
  }

  ctx.drawImage(source, 0, 0, w, h)

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/webp',
      THUMB_QUALITY,
    )
  })
}

export interface ImageThumbResult {
  thumb: Blob | null
  width: number
  height: number
}

export async function makeImageThumb(file: File): Promise<ImageThumbResult> {
  const img = await loadImage(file)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const thumb = await drawToThumb(img, width, height)
  return { thumb, width, height }
}

/**
 * Center-crop an image to a small square avatar and export it as WebP.
 * Returns null when the image cannot be decoded or canvas is unavailable.
 */
export async function makeAvatarThumb(file: File): Promise<Blob | null> {
  const img = await loadImage(file)
  const size = Math.min(img.naturalWidth, img.naturalHeight)

  if (size <= 0) {
    return null
  }

  const out = 256
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out

  const ctx = canvas.getContext('2d')

  if (ctx === null) {
    return null
  }

  const sx = (img.naturalWidth - size) / 2
  const sy = (img.naturalHeight - size) / 2
  ctx.drawImage(img, sx, sy, size, size, 0, 0, out, out)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.85)
  })
}

export interface VideoThumbResult {
  thumb: Blob | null
  width: number
  height: number
  duration: number
}

/**
 * Capture a poster frame from a video file entirely in the browser:
 * load metadata, seek near the start, draw the frame to a canvas, and
 * export it as the thumbnail. Returns null thumb when the codec cannot
 * be decoded or the seek times out.
 */
export async function makeVideoThumb(file: File): Promise<VideoThumbResult> {
  const url = URL.createObjectURL(file)

  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.src = url

    const loaded = await new Promise<HTMLVideoElement>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('metadata timeout')), 15000)
      video.addEventListener(
        'loadedmetadata',
        () => {
          window.clearTimeout(timer)
          resolve(video)
        },
        { once: true },
      )
      video.addEventListener(
        'error',
        () => {
          window.clearTimeout(timer)
          reject(new Error('video load error'))
        },
        { once: true },
      )
    })

    const duration = Number.isFinite(loaded.duration) ? loaded.duration : 0
    const width = loaded.videoWidth
    const height = loaded.videoHeight

    let thumb: Blob | null = null

    if (width > 0 && height > 0) {
      try {
        const target = duration > 0 ? Math.min(0.5, duration * 0.1) : 0

        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('seek timeout')), 10000)
          loaded.addEventListener(
            'seeked',
            () => {
              window.clearTimeout(timer)
              resolve()
            },
            { once: true },
          )
          loaded.addEventListener(
            'error',
            () => {
              window.clearTimeout(timer)
              reject(new Error('seek error'))
            },
            { once: true },
          )
          loaded.currentTime = target
        })

        thumb = await drawToThumb(loaded, width, height)
      } catch {
        thumb = null
      }
    }

    return { thumb, width, height, duration }
  } finally {
    URL.revokeObjectURL(url)
  }
}
