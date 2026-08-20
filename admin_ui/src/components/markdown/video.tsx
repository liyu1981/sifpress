/**
 * Auto-detected video embeds for image-syntax markdown links:
 *
 *   ![alt](https://example.com/clip.mp4)          direct video file
 *   ![alt](?p=sifpress/asset&id=3&kind=video)          app asset (video)
 *   ![alt](https://www.youtube.com/watch?v=…r)     YouTube
 *   ![alt](https://youtu.be/…) / short link
 *   ![alt](https://www.bilibili.com/video/BV…/)    Bilibili
 *
 * Any of these render as a player instead of a broken <img>. Size /
 * position directives from image-directives.ts still apply (e.g.
 * `![Alt|center](clip.mp4)`).
 *
 * App-asset URLs (`?p=sifpress/asset&id=N`) carry no extension, so the copied
 * markdown link tags them explicitly: `![clip](?p=sifpress/asset&id=3&filetype=mp4)`.
 * The backend ignores the extra `filetype` param; the renderer uses it to
 * choose `<video>` over `<img>`.
 *
 * An `|autoplay` directive in the alt text enables autoplay on bilibili
 * embeds: `![Bilibili|autoplay](https://www.bilibili.com/…)`. Without it
 * the player URL carries `autoplay=0`, so the video never starts on its own.
 */

import { cn } from '@/lib/utils';

type VideoKind = 'file' | 'youtube' | 'bilibili';

export interface ResolvedVideo {
  kind: VideoKind;
  src: string;
}

const VIDEO_EXT_RE = /\.(?:mp4|webm|ogg|ogv|m4v)(?:[?#].*)?$/i;
const ASSET_URL_RE = /[?&]p=asset\b/i;
const ASSET_VIDEO_HINT_RE = /[?&]kind=video\b|[?&]filetype=(?:mp4|webm|ogg|ogv|m4v)(?:[&#]|$)/i;

const YOUTUBE_HOST_RE = /(?:^|\.)youtube\.com|youtu\.be/i;
const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

const BILIBILI_HOST_RE = /(?:^|\.)bilibili\.com|b23\.tv/i;
const BILIBILI_BV_RE = /BV[0-9A-Za-z]{10}/;
const BILIBILI_AV_RE = /(?:av|aid=)(\d{1,12})/i;

export function resolveVideo(src: string): ResolvedVideo | null {
  if (src === '') {
    return null;
  }

  if (VIDEO_EXT_RE.test(src) || src.startsWith('data:video/')) {
    return { kind: 'file', src };
  }

  if (ASSET_URL_RE.test(src)) {
    return ASSET_VIDEO_HINT_RE.test(src) ? { kind: 'file', src } : null;
  }

  if (YOUTUBE_HOST_RE.test(src)) {
    const id = YOUTUBE_ID_RE.exec(src)?.[1] ?? /[?&]v=([A-Za-z0-9_-]{11})/.exec(src)?.[1];

    if (id) {
      return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` };
    }

    return null;
  }

  if (BILIBILI_HOST_RE.test(src)) {
    const bv = BILIBILI_BV_RE.exec(src)?.[0];
    const av = BILIBILI_AV_RE.exec(src)?.[1];

    if (bv) {
      return {
        kind: 'bilibili',
        src: `https://player.bilibili.com/player.html?bvid=${bv}&page=1&high_quality=1&danmaku=0`,
      };
    }

    if (av) {
      return {
        kind: 'bilibili',
        src: `https://player.bilibili.com/player.html?aid=${av}&page=1&high_quality=1&danmaku=0`,
      };
    }

    return null;
  }

  return null;
}

export function isVideoSource(src: string): boolean {
  return resolveVideo(src) !== null;
}

function toCssSize(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    return `${value}px`;
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    return undefined;
  }

  return /^\d+$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

const EMBED_IFRAME_CLASS =
  'my-6 mx-auto block aspect-video w-full rounded-xl border border-black/20 bg-muted/30 dark:border-border';

export function VideoEmbed({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  const video = resolveVideo(src);

  if (video === null) {
    return null;
  }

  const maxWidth = toCssSize(width);
  const maxHeight = toCssSize(height);

  const parts = (alt ?? '').split('|');
  const autoplay = parts.includes('autoplay');
  const label = parts.filter(part => part !== 'autoplay').join('|');

  if (video.kind === 'file') {
    return (
      <video
        controls
        preload="metadata"
        src={video.src}
        title={label}
        className={cn('my-6 mx-auto block max-h-[75vh] w-full rounded-xl bg-black', className)}
        style={{
          ...(maxWidth !== undefined ? { maxWidth } : {}),
          ...(maxHeight !== undefined ? { maxHeight } : {}),
        }}
      />
    );
  }

  const iframeSrc =
    video.kind === 'bilibili' ? `${video.src}&autoplay=${autoplay ? '1' : '0'}` : video.src;

  return (
    <iframe
      src={iframeSrc}
      title={label || 'Embedded video'}
      className={cn(EMBED_IFRAME_CLASS, className)}
      style={maxWidth !== undefined ? { maxWidth } : undefined}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
