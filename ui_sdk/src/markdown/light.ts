/**
 * Lightweight markdown helpers that carry no Milkdown/ProseMirror import.
 * The core `ui-sdk.mjs` re-exports these directly; the heavy render/edit
 * pipeline lives in the lazily-loaded `ui-sdk-markdown.mjs` chunk (see
 * `../markdown-lazy.ts`).
 */
export { resolveVideo, isVideoSource, type ResolvedVideo } from './video-source';
export { escapeTableCodePipes } from './preprocess';
export { buildVideoElement, type BuildVideoElementOptions } from './video-element';
export { rebuildImageAlt, type ImageDirectiveAttrs } from './image-directives';
