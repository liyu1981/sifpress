import { imageSchema } from '@milkdown/kit/preset/commonmark';
import { parseImageDirectives, rebuildImageAlt } from './image-directives';

/**
 * Extends the commonmark image schema with the `![Alt|640]` directive
 * attributes. Lives apart from `image-directives.ts` so the pure
 * directive parsing/rebuilding helpers stay free of a Milkdown import and
 * can ship in the lightweight core bundle.
 */
export const imageDirectivesSchema = imageSchema.extendSchema(prev => ctx => {
  const base = prev(ctx);

  return {
    ...base,
    attrs: {
      ...base.attrs,
      width: { default: null },
      height: { default: null },
      position: { default: null },
      asLink: { default: false },
      autoplay: { default: false },
    },
    parseMarkdown: {
      match: base.parseMarkdown.match,
      runner: (state, node, type) => {
        const directives = parseImageDirectives((node.alt as string) ?? '');
        state.addNode(type, {
          src: (node.url as string) ?? '',
          alt: directives.caption,
          title: (node.title as string) ?? '',
          width: directives.width,
          height: directives.height,
          position: directives.position,
          asLink: directives.asLink,
          autoplay: directives.autoplay,
        });
      },
    },
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        state.addNode('image', undefined, undefined, {
          title: node.attrs.title,
          url: node.attrs.src,
          alt: rebuildImageAlt(
            node.attrs as unknown as {
              alt: string;
              width: number | null;
              height: number | null;
              position: string | null;
              asLink: boolean;
              autoplay: boolean;
            },
          ),
        });
      },
    },
    toDOM: node => {
      const attrs = node.attrs;

      if (attrs.asLink) {
        return [
          'a',
          { href: attrs.src, class: 'md-img-link' },
          (attrs.alt as string) || (attrs.src as string),
        ];
      }

      const domAttrs: Record<string, string> = {
        src: attrs.src,
        alt: attrs.alt ?? '',
      };

      if (attrs.title) domAttrs.title = attrs.title;
      if (attrs.width != null) domAttrs.width = String(attrs.width);
      if (attrs.height != null) domAttrs.height = String(attrs.height);
      if (attrs.autoplay) domAttrs['data-autoplay'] = 'true';

      const classes: string[] = [];
      if (attrs.position) classes.push(`md-img-${attrs.position}`);
      if (classes.length > 0) domAttrs.class = classes.join(' ');

      return ['img', domAttrs];
    },
  };
});
