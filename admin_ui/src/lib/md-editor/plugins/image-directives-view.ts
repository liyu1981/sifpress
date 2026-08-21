import { imageSchema } from '@milkdown/kit/preset/commonmark';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/kit/utils';
import { buildVideoElement, type ImageDirectiveAttrs } from 'ui-sdk';

/**
 * Editor-only node view for the image node. Renders the same way the final
 * article render does: a lone image becomes a block with its alt shown as a
 * caption below it, matching `liftLoneImageFigures` in postprocess.ts. Images
 * embedded inline in a paragraph stay inline (no caption).
 */
function isLoneImage(view: EditorView, pos: number | undefined): boolean {
  if (pos === undefined) {
    return false;
  }
  const parent = view.state.doc.resolve(pos).parent;
  return parent.childCount === 1 && parent.firstChild?.type.name === 'image';
}

export const imageDirectivesView = $view(imageSchema.node, () => {
  return (initialNode: Node, view: EditorView, getPos): NodeView => {
    const dom = document.createElement('span');
    dom.className = 'md-image-view';

    const sync = (node: Node): void => {
      const attrs = node.attrs as unknown as ImageDirectiveAttrs;
      const lone = isLoneImage(view, getPos());

      // A position directive makes the image a block (with a caption); without
      // one it stays inline so text can be typed around it in the paragraph.
      const block = lone && attrs.position !== null;

      dom.textContent = '';
      dom.className = 'md-image-view';

      if (attrs.asLink) {
        const anchor = document.createElement('a');
        anchor.href = attrs.src;
        anchor.className = 'md-img-link';
        anchor.textContent = attrs.alt || attrs.src;
        dom.appendChild(anchor);
        return;
      }

      const positionClass = attrs.position !== null ? `md-img-${attrs.position}` : undefined;
      const player = buildVideoElement({
        src: attrs.src,
        alt: attrs.alt ?? '',
        autoplay: attrs.autoplay,
        width: attrs.width,
        height: attrs.height,
        className: positionClass,
      });

      if (player !== null) {
        dom.appendChild(player);
      } else {
        const img = document.createElement('img');
        img.src = attrs.src;
        img.alt = attrs.alt ?? '';
        if (attrs.title !== '') img.title = attrs.title;
        if (attrs.width != null) img.setAttribute('width', String(attrs.width));
        if (attrs.height != null) img.setAttribute('height', String(attrs.height));
        if (positionClass !== undefined) img.classList.add(positionClass);
        dom.appendChild(img);
      }

      if (block) {
        dom.classList.add('md-image-view-lone');
        if (attrs.alt !== '') {
          const caption = document.createElement('span');
          caption.className = 'md-image-caption';
          caption.textContent = attrs.alt;
          dom.appendChild(caption);
        }
      }
    };

    sync(initialNode);

    return {
      dom,
      update: (updatedNode: Node) => {
        if (updatedNode.type !== initialNode.type) {
          return false;
        }
        sync(updatedNode);
        return true;
      },
    };
  };
});
