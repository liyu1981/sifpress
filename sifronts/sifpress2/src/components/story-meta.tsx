import { Clock } from 'lucide-react';
import { formatDate, formatRelative } from '@/lib/format';
import type { Story } from '@/lib/stories';
import { useCopy } from '@/lib/theme-config';
import { cn } from '@/lib/utils';

export function StoryMeta({
  story,
  showAuthor = true,
  relative = false,
  className,
}: {
  story: Story;
  showAuthor?: boolean;
  relative?: boolean;
  className?: string;
}) {
  const copy = useCopy();
  const date = relative ? formatRelative(story.createdAt) : formatDate(story.createdAt, 'short');

  return (
    <div className={cn('meta-line flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {showAuthor && story.author !== '' && <span className="font-medium">{story.author}</span>}
      <span className="inline-flex items-center gap-1.5">
        <Clock className="size-3" />
        {date} · {copy('minRead', { min: story.readingMinutes })}
      </span>
    </div>
  );
}
