const THUMB_MAX_EDGE = 400;
const THUMB_QUALITY = 0.8;
const VISION_MAX_EDGE = 1024;
const VISION_QUALITY = 0.85;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
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
  maxEdge = THUMB_MAX_EDGE,
  quality = THUMB_QUALITY,
): Promise<Blob | null> {
  if (width <= 0 || height <= 0) {
    return Promise.resolve(null);
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');

  if (ctx === null) {
    return Promise.resolve(null);
  }

  ctx.drawImage(source, 0, 0, w, h);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/webp', quality);
  });
}

export interface ImageThumbResult {
  thumb: Blob | null;
  width: number;
  height: number;
}

export async function makeImageThumb(file: File): Promise<ImageThumbResult> {
  const img = await loadImage(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const thumb = await drawToThumb(img, width, height);
  return { thumb, width, height };
}

/**
 * Downscale a picked image to a vision-friendly payload (WebP, max edge
 * 1024px) so it can be attached to a model message without exhausting the
 * localStorage quota. Falls back to the original file when the image cannot
 * be decoded or re-encoded.
 */
export async function makeVisionImage(file: File): Promise<Blob> {
  try {
    const img = await loadImage(file);
    const blob = await drawToThumb(
      img,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      VISION_MAX_EDGE,
      VISION_QUALITY,
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Center-crop an image to a small square avatar and export it as WebP.
 * Returns null when the image cannot be decoded or canvas is unavailable.
 */
export async function makeAvatarThumb(file: File): Promise<Blob | null> {
  const img = await loadImage(file);
  const size = Math.min(img.naturalWidth, img.naturalHeight);

  if (size <= 0) {
    return null;
  }

  const out = 256;
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;

  const ctx = canvas.getContext('2d');

  if (ctx === null) {
    return null;
  }

  const sx = (img.naturalWidth - size) / 2;
  const sy = (img.naturalHeight - size) / 2;
  ctx.drawImage(img, sx, sy, size, size, 0, 0, out, out);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/webp', 0.85);
  });
}

export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

/**
 * Decode an image once for optimization. Prefers `createImageBitmap`, which
 * decodes off the main thread, and falls back to an `<img>` element when the
 * browser does not support it. The caller must call `dispose()` when done.
 */
export async function loadImageForOptimization(blob: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // fall through to the <img> path
    }
  }

  const img = await loadImage(blob);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    dispose: () => {},
  };
}

export interface ImageOptimization {
  id: string;
  mode: 'desample' | 'resize';
  mime: string;
  quality: number;
  /** Target long edge, or null to keep the source dimensions. */
  maxEdge: number | null;
  width: number;
  height: number;
}

function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Build the ordered list of local optimization candidates for an image that
 * is over the upload limit. Ordered from least to most aggressive so the
 * first option that fits the limit can be picked as the recommendation.
 * Pure and synchronous — encoding/estimating happens separately.
 */
export function planImageOptimizations(width: number, height: number): ImageOptimization[] {
  const long = Math.max(width, height);
  const options: ImageOptimization[] = [];

  const push = (mode: ImageOptimization['mode'], maxEdge: number | null, quality: number): void => {
    if (maxEdge !== null && maxEdge >= long) {
      return;
    }
    const dims = maxEdge === null ? { width, height } : fitWithin(width, height, maxEdge);
    const id = `${mode}-${maxEdge ?? 'full'}-${quality}`;
    if (options.some(option => option.id === id)) {
      return;
    }
    options.push({ id, mode, mime: 'image/webp', quality, maxEdge, ...dims });
  };

  push('desample', null, 0.85);
  push('desample', null, 0.7);
  for (const edge of [2048, 1600, 1280, 1024, 800]) {
    push('resize', edge, 0.8);
  }

  return options;
}

export interface ImageOptimizationResult {
  blob: Blob | null;
  mime: string;
}

/**
 * Encode one optimization candidate. The canvas encode (`toBlob`) is
 * asynchronous; combined with `loadImageForOptimization` this keeps decoding
 * and encoding off the render path so the caller stays responsive.
 */
export async function renderImageOptimization(
  image: LoadedImage,
  option: ImageOptimization,
): Promise<ImageOptimizationResult> {
  if (option.width <= 0 || option.height <= 0) {
    return { blob: null, mime: option.mime };
  }

  const canvas = document.createElement('canvas');
  canvas.width = option.width;
  canvas.height = option.height;

  const ctx = canvas.getContext('2d');

  if (ctx === null) {
    return { blob: null, mime: option.mime };
  }

  if (option.mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, option.width, option.height);
  }

  ctx.drawImage(image.source, 0, 0, image.width, image.height, 0, 0, option.width, option.height);

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(result => resolve(result), option.mime, option.quality);
  });

  return { blob, mime: blob?.type || option.mime };
}

export interface VideoThumbResult {
  thumb: Blob | null;
  width: number;
  height: number;
  duration: number;
}

/**
 * Capture a poster frame from a video file entirely in the browser:
 * load metadata, seek near the start, draw the frame to a canvas, and
 * export it as the thumbnail. Returns null thumb when the codec cannot
 * be decoded or the seek times out.
 */
export async function makeVideoThumb(file: File): Promise<VideoThumbResult> {
  const url = URL.createObjectURL(file);

  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;

    const loaded = await new Promise<HTMLVideoElement>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('metadata timeout')), 15000);
      video.addEventListener(
        'loadedmetadata',
        () => {
          window.clearTimeout(timer);
          resolve(video);
        },
        { once: true },
      );
      video.addEventListener(
        'error',
        () => {
          window.clearTimeout(timer);
          reject(new Error('video load error'));
        },
        { once: true },
      );
    });

    const duration = Number.isFinite(loaded.duration) ? loaded.duration : 0;
    const width = loaded.videoWidth;
    const height = loaded.videoHeight;

    let thumb: Blob | null = null;

    if (width > 0 && height > 0) {
      try {
        const target = duration > 0 ? Math.min(0.5, duration * 0.1) : 0;

        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('seek timeout')), 10000);
          loaded.addEventListener(
            'seeked',
            () => {
              window.clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
          loaded.addEventListener(
            'error',
            () => {
              window.clearTimeout(timer);
              reject(new Error('seek error'));
            },
            { once: true },
          );
          loaded.currentTime = target;
        });

        thumb = await drawToThumb(loaded, width, height);
      } catch {
        thumb = null;
      }
    }

    return { thumb, width, height, duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
