/**
 * Bridge from the agent's write tools into the live EditorPage UI state.
 *
 * The agent must not touch backend APIs (create_page / update_page are
 * removed). Instead it mutates the open editor's own frontmatter and
 * content sections through this interface — changes land in the editor and
 * are only persisted when the user hits Save, so they are non-destructive.
 */
export interface EditorFrontMatter {
  title: string;
  slug: string;
  date: string;
  tags: string[];
  extra: Array<{ key: string; value: string }>;
  seo: {
    seo_title: string;
    description: string;
    keywords: string;
    og_image: string;
    canonical: string;
    noindex: boolean;
  };
}

export type FrontMatterPatch = Partial<EditorFrontMatter>;

export interface EditorMutationBridge {
  getFrontMatter: () => EditorFrontMatter;
  getFrontMatterYaml: () => string;
  setFrontMatter: (patch: FrontMatterPatch) => void;
  getContent: () => string;
  setContent: (markdown: string) => void;
}
