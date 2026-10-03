import { useQuery } from '@tanstack/react-query';
import { type Page, type PageListItem, type PageSeo, type SearchResult, pagesApi } from 'ui-sdk';
import { type StoryMeta, readStoryMeta, truncate } from '@/lib/format';

export const FRONT_PAGE_SIZE = 40;

export interface Story extends StoryMeta {
  id: number;
  slug: string;
  title: string;
  section: string | null;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
}

type StorySource = Page | PageListItem;

const metaCache = new Map<string, StoryMeta>();

/** Front-matter parsing is regex-heavy; memoise per page revision. */
function cachedMeta(source: StorySource): StoryMeta {
  const key = `${source.slug}:${source.updated_at}:${source.content_md.length}`;
  const cached = metaCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const meta = readStoryMeta(source.content_md);

  if (metaCache.size > 200) {
    metaCache.clear();
  }

  metaCache.set(key, meta);

  return meta;
}

export function toStory(source: StorySource): Story {
  const meta = cachedMeta(source);
  const tags = source.tags ?? [];

  return {
    ...meta,
    id: source.id,
    slug: source.slug,
    title: source.title,
    section: tags[0] ?? null,
    tags,
    author: source.created_by_name,
    createdAt: source.created_at,
    updatedAt: source.updated_at,
  };
}

export function useLatestStories(perPage = FRONT_PAGE_SIZE) {
  return useQuery({
    queryKey: ['sifront2', 'latest', perPage],
    queryFn: () =>
      pagesApi
        .list({ status: 'published', per_page: perPage, page: 1 })
        .then(result => result.items.map(toStory)),
    staleTime: 60_000,
  });
}

export function useStory(slug: string) {
  return useQuery({
    queryKey: ['sifront2', 'story', slug],
    queryFn: () => pagesApi.get({ slug }).then(toStory),
    staleTime: 60_000,
  });
}

export interface SectionBlock {
  name: string;
  stories: Story[];
}

export interface SectionOptions {
  /** Admin-pinned section names, in the order they should appear. */
  only?: string[];
  max?: number;
  perSection?: number;
}

/**
 * Group a pool of stories into per-section blocks (first tag wins), keeping
 * only sections with enough stories to fill a rail. Pinned sections lead,
 * the rest are ordered by size.
 */
export function groupSections(
  stories: Story[],
  exclude: Set<string>,
  { only = [], max = 2, perSection = 5 }: SectionOptions = {},
): SectionBlock[] {
  const buckets = new Map<string, Story[]>();

  for (const story of stories) {
    const name = story.section;

    if (name === null || exclude.has(story.slug)) {
      continue;
    }

    const bucket = buckets.get(name);

    if (bucket === undefined) {
      buckets.set(name, [story]);
    } else {
      bucket.push(story);
    }
  }

  const candidates = [...buckets.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([name, items]) => ({ name, stories: items.slice(0, perSection) }));

  if (only.length > 0) {
    return only
      .map(name => candidates.find(block => block.name === name))
      .filter((block): block is SectionBlock => block !== undefined);
  }

  return candidates.sort((a, b) => b.stories.length - a.stories.length).slice(0, max);
}

/** Promote admin-pinned slugs to the front of the pool, keeping the rest in order. */
export function applyFeaturedSlugs(stories: Story[], slugs: string[]): Story[] {
  if (slugs.length === 0) {
    return stories;
  }

  const pinned = slugs
    .map(slug => stories.find(story => story.slug === slug))
    .filter((story): story is Story => story !== undefined);

  if (pinned.length === 0) {
    return stories;
  }

  const pinnedSlugs = new Set(pinned.map(story => story.slug));

  return [...pinned, ...stories.filter(story => !pinnedSlugs.has(story.slug))];
}

export interface SectionPage {
  items: Story[];
  total: number;
}

export function useSectionStories(tag: string, page: number) {
  return useQuery({
    queryKey: ['sifront2', 'section', tag, page],
    queryFn: () =>
      pagesApi
        .list({ status: 'published', tag: tag === '' ? undefined : tag, page, per_page: 12 })
        .then(
          (result): SectionPage => ({
            items: result.items.map(toStory),
            total: result.total,
          }),
        ),
    staleTime: 60_000,
  });
}

export interface SearchPage {
  items: Story[];
  total: number;
}

function toSearchStory(result: SearchResult): Story {
  return {
    id: result.id,
    slug: result.slug,
    title: result.title,
    section: null,
    tags: [],
    author: result.created_by_name,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
    cover: null,
    caption: '',
    dek: truncate(result.excerpt ?? ''),
    excerpt: truncate(result.excerpt ?? ''),
    readingMinutes: 1,
  };
}

export function useSearchStories(query: string, page: number) {
  return useQuery({
    queryKey: ['sifront2', 'search', query, page],
    queryFn: () =>
      pagesApi.search(query, { page, per_page: 12 }).then(
        (result): SearchPage => ({
          items: result.items.map(toSearchStory),
          total: result.total,
        }),
      ),
    staleTime: 60_000,
    enabled: query !== '',
  });
}

export interface ArticlePage extends Story {
  content_md: string;
  canEdit: boolean;
  seo: PageSeo;
}

export function useArticle(slug: string) {
  return useQuery({
    queryKey: ['sifront2', 'article', slug],
    queryFn: (): Promise<ArticlePage> =>
      pagesApi.get({ slug }).then(page => ({
        ...toStory(page),
        content_md: page.content_md,
        canEdit: page.can_edit,
        seo: page.seo,
      })),
    staleTime: 60_000,
  });
}
