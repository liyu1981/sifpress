import { cn } from '@/lib/utils';

const RATIOS: Record<string, string> = {
  '3/2': 'aspect-[3/2]',
  '4/3': 'aspect-[4/3]',
  '16/9': 'aspect-video',
  '21/9': 'aspect-[21/9]',
  '1/1': 'aspect-square',
};

export function Cover({
  src,
  alt,
  ratio = '3/2',
  caption,
  className,
  priority = false,
}: {
  src: string | null;
  alt: string;
  ratio?: keyof typeof RATIOS;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  const figure = (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-muted',
        RATIOS[ratio] ?? RATIOS['3/2'],
        src === null && 'cover-fallback',
        className,
      )}
    >
      {src !== null && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );

  if (caption === undefined || caption === '') {
    return figure;
  }

  return (
    <figure className="m-0">
      {figure}
      <figcaption className="meta-line mt-2">{caption}</figcaption>
    </figure>
  );
}
