import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { RailItem } from '@/components/story-card';
import type { SectionBlock as SectionBlockData } from '@/lib/stories';

export function SectionBlock({
  block,
  showCovers = false,
}: {
  block: SectionBlockData;
  showCovers?: boolean;
}) {
  return (
    <section aria-label={block.name} className="rule-top-strong pt-4">
      <header className="flex items-baseline justify-between gap-4 pb-1">
        <h2 className="headline-tight text-2xl sm:text-[1.75rem]">
          <Link
            to="/section/$section"
            params={{ section: block.name }}
            className="story-link decoration-none"
          >
            {block.name}
          </Link>
        </h2>
        <Link
          to="/section/$section"
          params={{ section: block.name }}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tracking-[0.08em] text-brand uppercase transition-colors hover:text-brand-ink"
        >
          All
          <ArrowRight className="size-3.5" />
        </Link>
      </header>

      <div className="rule-top">
        {block.stories.map(story => (
          <RailItem key={story.id} story={story} showCover={showCovers} />
        ))}
      </div>
    </section>
  );
}
