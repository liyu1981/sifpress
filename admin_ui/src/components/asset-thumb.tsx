import { Film } from 'lucide-react';
import { type Asset, assetUrl } from 'ui-sdk';

export function AssetThumb({
  asset,
  iconClassName = 'size-10',
}: {
  asset: Asset;
  iconClassName?: string;
}) {
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
      <Film className={iconClassName} />
    </div>
  );
}
