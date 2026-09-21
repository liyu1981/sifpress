const SIZE_PATTERN = /^(\d*)x(\d*)$|^(\d+)$/;

const POSITION_CLASS: Record<string, string> = {
  left: 'left',
  right: 'right',
  center: 'center',
  'float-left': 'float-left',
  'float-right': 'float-right',
};

const LINK_DIRECTIVES = new Set(['link', 'noembed']);
const AUTOPLAY_DIRECTIVES = new Set(['autoplay']);

interface ParsedImageDirectives {
  caption: string;
  width: number | null;
  height: number | null;
  position: string | null;
  asLink: boolean;
  autoplay: boolean;
}

export function parseImageDirectives(alt: string): ParsedImageDirectives {
  const parts = alt.split('|');
  const caption: string[] = [];
  let width: number | null = null;
  let height: number | null = null;
  let position: string | null = null;
  let asLink = false;
  let autoplay = false;

  for (const part of parts) {
    const size = SIZE_PATTERN.exec(part);

    if (size) {
      if (size[3] !== undefined) {
        width = Number(size[3]);
      } else {
        if (size[1] !== '') width = Number(size[1]);
        if (size[2] !== '') height = Number(size[2]);
      }
      continue;
    }

    const positionClass = POSITION_CLASS[part];

    if (positionClass !== undefined) {
      position = positionClass;
      continue;
    }

    if (LINK_DIRECTIVES.has(part)) {
      asLink = true;
      continue;
    }

    if (AUTOPLAY_DIRECTIVES.has(part)) {
      autoplay = true;
      continue;
    }

    caption.push(part);
  }

  return {
    caption: caption.join('|'),
    width,
    height,
    position,
    asLink,
    autoplay,
  };
}

export interface ImageDirectiveAttrs {
  src: string;
  alt: string;
  title: string;
  width: number | null;
  height: number | null;
  position: string | null;
  asLink: boolean;
  autoplay: boolean;
}

export function rebuildImageAlt(attrs: {
  alt: string;
  width: number | null;
  height: number | null;
  position: string | null;
  asLink: boolean;
  autoplay: boolean;
}): string {
  const parts: string[] = [];

  if (attrs.alt !== '') {
    parts.push(attrs.alt);
  }

  if (attrs.width !== null && attrs.height !== null) {
    parts.push(`${attrs.width}x${attrs.height}`);
  } else if (attrs.width !== null) {
    parts.push(String(attrs.width));
  } else if (attrs.height !== null) {
    parts.push(`x${attrs.height}`);
  }

  if (attrs.position !== null) {
    parts.push(attrs.position);
  }

  if (attrs.asLink) {
    parts.push('link');
  }

  if (attrs.autoplay) {
    parts.push('autoplay');
  }

  return parts.join('|');
}
