import type { Ctx } from '@milkdown/kit/ctx';
import { TooltipProvider, tooltipFactory } from '@milkdown/kit/plugin/tooltip';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorState, PluginView } from '@milkdown/kit/prose/state';
import { NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { ChevronDown, Film, Loader2, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isVideoSource } from '@/components/markdown/video';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { assetSourceUrl, assetUrl } from '@/lib/api';
import i18n from '@/lib/i18n';
import { type Asset, assetsApi } from '@/lib/pages';
import { cn } from '@/lib/utils';
import { type ImageDirectiveAttrs, rebuildImageAlt } from './image-directives';
import { bestEffortPositionMiddleware } from './image-directives-position';

export const imageDirectiveTooltip = tooltipFactory('IMAGE_DIRECTIVES');

const POSITION_NONE = '__none__';

const POSITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: POSITION_NONE, label: '' },
  { value: 'left', label: 'imagePositionLeft' },
  { value: 'center', label: 'imagePositionCenter' },
  { value: 'right', label: 'imagePositionRight' },
  { value: 'float-left', label: 'imagePositionFloatLeft' },
  { value: 'float-right', label: 'imagePositionFloatRight' },
];

function buildImageMarkdown(attrs: ImageDirectiveAttrs): string {
  const title = attrs.title !== '' ? ` "${attrs.title}"` : '';
  return `![${rebuildImageAlt(attrs)}](${attrs.src}${title})`;
}

interface ImageDirectivePopupProps {
  node: Node;
  onCommit: (patch: Partial<ImageDirectiveAttrs>) => void;
  onUpload?: (file: File) => Promise<string>;
}

const ASSETS_PER_PAGE = 9;

function AssetThumb({ asset }: { asset: Asset }) {
  if (asset.has_thumb) {
    return (
      <img
        src={assetUrl(asset.id, true)}
        alt={asset.name}
        loading="lazy"
        className="size-full object-cover"
      />
    );
  }

  if (asset.kind === 'image') {
    return (
      <img
        src={assetUrl(asset.id)}
        alt={asset.name}
        loading="lazy"
        className="size-full object-contain"
      />
    );
  }

  return (
    <div className="flex size-full items-center justify-center bg-muted/30 text-muted-foreground">
      <Film className="size-6" />
    </div>
  );
}

function ImageDirectivePopup({ node, onCommit, onUpload }: ImageDirectivePopupProps) {
  const t = i18n.t.bind(i18n);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsPage, setAssetsPage] = useState(1);
  const [assetsTotal, setAssetsTotal] = useState(0);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const attrs = node.attrs as unknown as ImageDirectiveAttrs;

  const setDimension = (key: 'width' | 'height') => (raw: string) => {
    const value = raw.trim();
    if (value === '') {
      onCommit({ [key]: null });
      return;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      onCommit({ [key]: Math.round(parsed) });
    }
  };

  const isLink = attrs.asLink;
  const isVideo = !isLink && isVideoSource(attrs.src);

  const loadAssets = useCallback(
    async (page: number): Promise<void> => {
      setAssetsLoading(true);
      try {
        const result = await assetsApi.list({
          kind: isVideo ? 'video' : 'image',
          page,
          per_page: ASSETS_PER_PAGE,
        });
        setAssets(prev => (page === 1 ? result.items : [...prev, ...result.items]));
        setAssetsTotal(result.total);
        setAssetsPage(page);
      } finally {
        setAssetsLoading(false);
      }
    },
    [isVideo],
  );

  const toggleAssets = (): void => {
    setAssetsOpen(open => {
      const next = !open;
      if (next && assets.length === 0) {
        void loadAssets(1);
      }
      return next;
    });
  };

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined || onUpload === undefined) {
      return;
    }
    setUploading(true);
    try {
      const url = await onUpload(file);
      onCommit({ src: url });
      if (assetsOpen) {
        void loadAssets(1);
      }
    } finally {
      setUploading(false);
    }
  };

  const positionValue = attrs.position ?? POSITION_NONE;

  return (
    <div className="flex overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-lg">
      <div className="flex w-[19rem] flex-col p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t(isVideo ? 'editor.videoDirectivesTitle' : 'editor.imageDirectivesTitle')}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept={isVideo ? 'video/*' : 'image/*'}
            className="hidden"
            onChange={event => {
              void handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {onUpload !== undefined && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={toggleAssets}
              aria-expanded={assetsOpen}
              className="gap-1"
            >
              {t('editor.mediaAssets')}
              <ChevronDown
                className={cn('size-3.5 transition-transform', assetsOpen && 'rotate-180')}
              />
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid gap-2">
            <Label className="block text-xs font-medium text-muted-foreground">
              {t('editor.imageSrc')}
            </Label>
            <Input
              type="text"
              value={attrs.src}
              spellCheck={false}
              onChange={event => onCommit({ src: event.target.value })}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid gap-2">
            <Label className="block text-xs font-medium text-muted-foreground">
              {t('editor.imageAlt')}
            </Label>
            <Input
              type="text"
              value={attrs.alt}
              placeholder={attrs.src}
              onChange={event => onCommit({ alt: event.target.value })}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label className="block text-xs font-medium text-muted-foreground">
                {t('editor.imageWidth')}
              </Label>
              <Input
                type="number"
                min={1}
                value={attrs.width ?? ''}
                disabled={isLink}
                onChange={event => setDimension('width')(event.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <Label className="block text-xs font-medium text-muted-foreground">
                {t('editor.imageHeight')}
              </Label>
              <Input
                type="number"
                min={1}
                value={attrs.height ?? ''}
                disabled={isLink}
                onChange={event => setDimension('height')(event.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="block text-xs font-medium text-muted-foreground">
              {t('editor.imagePosition')}
            </Label>
            <Select
              value={positionValue}
              disabled={isLink}
              onValueChange={value =>
                onCommit({ position: value === POSITION_NONE ? null : value })
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="" />
              </SelectTrigger>
              <SelectContent>
                {POSITION_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label === '' ? '' : t(`editor.${option.label}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            {t('editor.imageAsLink')}
            <Switch checked={isLink} onCheckedChange={checked => onCommit({ asLink: checked })} />
          </Label>

          {isVideo && (
            <Label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
              {t('editor.imageAutoplay')}
              <Switch
                checked={attrs.autoplay}
                onCheckedChange={checked => onCommit({ autoplay: checked })}
              />
            </Label>
          )}

          <div className="rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('editor.imageMarkdown')}
            </span>
            <code
              className={cn('block truncate font-mono text-xs leading-relaxed text-foreground/90')}
              title={buildImageMarkdown(attrs)}
            >
              {buildImageMarkdown(attrs)}
            </code>
          </div>
        </div>
      </div>

      {assetsOpen && onUpload !== undefined && (
        <div className="flex w-56 flex-col gap-2.5 border-l border-border/60 p-3">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border/70 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {uploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Plus className="size-5" />
              )}
              <span className="px-1 text-center text-[0.6rem] leading-tight">
                {uploading ? t('editor.imageUploading') : t('editor.imageUpload')}
              </span>
            </button>
            {assets.map(asset => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onCommit({ src: assetSourceUrl(asset.id, asset.name, asset.kind) })}
                title={asset.name}
                className="aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-colors hover:border-ring"
              >
                <AssetThumb asset={asset} />
              </button>
            ))}
          </div>

          {assetsLoading && (
            <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
          )}
          {!assetsLoading && assets.length > 0 && assets.length < assetsTotal && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-full"
              onClick={() => void loadAssets(assetsPage + 1)}
            >
              {t('editor.mediaLoadMore')}
            </Button>
          )}
          {!assetsLoading && assets.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">{t('editor.mediaEmpty')}</p>
          )}
        </div>
      )}
    </div>
  );
}

class ImageDirectiveTooltipView implements PluginView {
  readonly #tooltipProvider: TooltipProvider;
  readonly #root: Root;
  readonly #content: HTMLElement;
  readonly #ctx: Ctx;
  #view: EditorView;
  readonly #onUpload?: (file: File) => Promise<string>;

  constructor(ctx: Ctx, view: EditorView, onUpload?: (file: File) => Promise<string>) {
    this.#ctx = ctx;
    this.#view = view;
    this.#onUpload = onUpload;
    this.#content = document.createElement('div');
    this.#content.className = 'md-image-directives-tooltip';
    this.#root = createRoot(this.#content);

    this.#tooltipProvider = new TooltipProvider({
      content: this.#content,
      debounce: 20,
      offset: 12,
      root: document.body,
      floatingUIOptions: { strategy: 'fixed' },
      middleware: [bestEffortPositionMiddleware],
      shouldShow: v => this.#isImageSelection(v),
    });

    this.#tooltipProvider.onShow = () => this.#render();
    this.update(view);
  }

  readonly #isImageSelection = (view: EditorView): boolean => {
    const { selection } = view.state;
    return (
      view.editable &&
      selection instanceof NodeSelection &&
      selection.node.type === imageSchema.type(this.#ctx)
    );
  };

  readonly #render = (): void => {
    const { selection } = this.#view.state;
    if (!(selection instanceof NodeSelection)) {
      return;
    }

    this.#root.render(
      <ImageDirectivePopup
        node={selection.node}
        onCommit={patch => this.#commit(patch)}
        onUpload={this.#onUpload}
      />,
    );
  };

  readonly #commit = (patch: Partial<ImageDirectiveAttrs>): void => {
    const { selection, tr } = this.#view.state;
    if (!(selection instanceof NodeSelection)) {
      return;
    }

    const { from } = selection;
    const nextAttrs = { ...selection.node.attrs, ...patch } as unknown as Record<string, unknown>;

    // setNodeMarkup collapses the NodeSelection into a TextSelection, which
    // would make the tooltip's shouldShow return false and hide the popup
    // after the first keystroke. Restore the selection in the same transaction.
    this.#view.dispatch(
      tr.setNodeMarkup(from, undefined, nextAttrs).setSelection(NodeSelection.create(tr.doc, from)),
    );
  };

  update = (view: EditorView, prevState?: EditorState): void => {
    this.#view = view;
    this.#tooltipProvider.update(view, prevState);

    if (this.#isImageSelection(view)) {
      this.#render();
    }
  };

  destroy = (): void => {
    this.#tooltipProvider.destroy();
    this.#root.unmount();
    this.#content.remove();
  };
}

export function configureImageDirectiveTooltip(onUpload?: (file: File) => Promise<string>) {
  return (ctx: Ctx) => {
    ctx.set(imageDirectiveTooltip.key, {
      view: view => new ImageDirectiveTooltipView(ctx, view, onUpload),
    });
  };
}
