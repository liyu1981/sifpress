import { Link } from '@tanstack/react-router';
import { Cover } from '@/components/cover';
import { SectionLink } from '@/components/kicker';
import { StoryMeta } from '@/components/story-meta';
import type { Story } from '@/lib/stories';
import { cn } from '@/lib/utils';

export type StoryCardVariant = 'lead' | 'standard' | 'compact' | 'rail' | 'row';

const HEADLINE: Record<StoryCardVariant, string> = {
  lead: 'headline text-4xl sm:text-5xl lg:text-[3.4rem]',
  standard: 'headline-tight text-xl sm:text-[1.4rem]',
  compact: 'headline-tight text-base',
  rail: 'headline-tight text-lg',
  row: 'headline-tight text-base',
};

function Kicker({ story }: { story: Story }) {
  if (story.section === null) {
    return <p className="kicker kicker-muted">Dispatch</p>;
  }

  return <SectionLink section={story.section} />;
}

function Dek({ story, className }: { story: Story; className?: string }) {
  const text = story.dek !== '' ? story.dek : story.excerpt;

  if (text === '') {
    return null;
  }

  return <p className={cn('dek line-clamp-3', className)}>{text}</p>;
}

export function StoryCard({
  story,
  variant = 'standard',
  showDek,
  showMeta = true,
  className,
  coverPriority = false,
}: {
  story: Story;
  variant?: StoryCardVariant;
  showDek?: boolean;
  showMeta?: boolean;
  className?: string;
  coverPriority?: boolean;
}) {
  const isLead = variant === 'lead';
  const withDek = showDek ?? (isLead || variant === 'standard');
  const isRow = variant === 'row';

  return (
    <article className={cn('group', isRow && 'flex gap-4', className)}>
      {isLead && (
        <Link
          to="/article/$slug"
          params={{ slug: story.slug }}
          className="block transition-opacity duration-300 group-hover:opacity-90"
          aria-hidden="true"
          tabIndex={-1}
        >
          <Cover
            src={story.cover}
            alt=""
            ratio="3/2"
            priority={coverPriority}
            caption={story.caption}
          />
        </Link>
      )}

      {variant === 'standard' && (
        <Link
          to="/article/$slug"
          params={{ slug: story.slug }}
          className="block transition-opacity duration-300 group-hover:opacity-90"
          aria-hidden="true"
          tabIndex={-1}
        >
          <Cover src={story.cover} alt="" ratio="4/3" caption={story.caption} />
        </Link>
      )}

      {isRow && (
        <Link
          to="/article/$slug"
          params={{ slug: story.slug }}
          className="block w-24 shrink-0 sm:w-32"
          aria-hidden="true"
          tabIndex={-1}
        >
          <Cover src={story.cover} alt="" ratio="1/1" />
        </Link>
      )}

      <div className={cn(isLead ? 'pt-5' : 'pt-4', isRow && 'min-w-0 flex-1 pt-0')}>
        <Kicker story={story} />

        <h3 className={cn('mt-2', HEADLINE[variant])}>
          <Link
            to="/article/$slug"
            params={{ slug: story.slug }}
            className="story-link decoration-none"
          >
            {story.title}
          </Link>
        </h3>

        {withDek && (
          <Dek story={story} className={cn('mt-3', isLead ? 'max-w-2xl text-lg' : undefined)} />
        )}

        {showMeta && <StoryMeta story={story} className={cn('mt-4', isLead && 'text-sm')} />}
      </div>
    </article>
  );
}

export function RailItem({ story, showCover = false }: { story: Story; showCover?: boolean }) {
  if (showCover) {
    return (
      <StoryCard
        story={story}
        variant="row"
        showDek={false}
        className="border-b border-rule py-4 last:border-b-0"
      />
    );
  }

  return (
    <article className="group rule-top py-5 first:border-t-0 first:pt-0">
      <Kicker story={story} />
      <h3 className="headline-tight mt-2 text-lg">
        <Link
          to="/article/$slug"
          params={{ slug: story.slug }}
          className="story-link decoration-none"
        >
          {story.title}
        </Link>
      </h3>
      <StoryMeta story={story} relative className="mt-2" />
    </article>
  );
}
