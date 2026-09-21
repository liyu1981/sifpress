/**
 * The Milkdown namespaces shared with the consumer apps. `build/vite-external-globals.ts`
 * rewrites their `@milkdown/*` imports to `window.SifpressUI.Milkdown[...]`, so
 * exactly one copy of Milkdown/ProseMirror is ever instantiated.
 *
 * This module is imported by the `ui-sdk-markdown.mjs` chunk (not the core),
 * because it is only needed by the editor and the markdown renderer.
 */
import * as CrepeBuilder from '@milkdown/crepe/builder';
import * as CrepeFeatureBlockEdit from '@milkdown/crepe/feature/block-edit';
import * as CrepeFeatureCodeMirror from '@milkdown/crepe/feature/code-mirror';
import * as CrepeFeatureCursor from '@milkdown/crepe/feature/cursor';
import * as CrepeFeatureLatex from '@milkdown/crepe/feature/latex';
import * as CrepeFeatureLinkTooltip from '@milkdown/crepe/feature/link-tooltip';
import * as CrepeFeatureListItem from '@milkdown/crepe/feature/list-item';
import * as CrepeFeaturePlaceholder from '@milkdown/crepe/feature/placeholder';
import * as CrepeFeatureTable from '@milkdown/crepe/feature/table';
import * as CrepeFeatureToolbar from '@milkdown/crepe/feature/toolbar';
import * as MilkdownCore from '@milkdown/kit/core';
import * as MilkdownCtx from '@milkdown/kit/ctx';
import * as MilkdownPluginTooltip from '@milkdown/kit/plugin/tooltip';
import * as MilkdownPresetCommonmark from '@milkdown/kit/preset/commonmark';
import * as MilkdownProseInputrules from '@milkdown/kit/prose/inputrules';
import * as MilkdownProseModel from '@milkdown/kit/prose/model';
import * as MilkdownProseState from '@milkdown/kit/prose/state';
import * as MilkdownProseView from '@milkdown/kit/prose/view';
import * as MilkdownUtils from '@milkdown/kit/utils';

export const Milkdown = {
  'crepe/builder': CrepeBuilder,
  'crepe/feature/block-edit': CrepeFeatureBlockEdit,
  'crepe/feature/code-mirror': CrepeFeatureCodeMirror,
  'crepe/feature/cursor': CrepeFeatureCursor,
  'crepe/feature/latex': CrepeFeatureLatex,
  'crepe/feature/link-tooltip': CrepeFeatureLinkTooltip,
  'crepe/feature/list-item': CrepeFeatureListItem,
  'crepe/feature/placeholder': CrepeFeaturePlaceholder,
  'crepe/feature/table': CrepeFeatureTable,
  'crepe/feature/toolbar': CrepeFeatureToolbar,
  'kit/core': MilkdownCore,
  'kit/ctx': MilkdownCtx,
  'kit/plugin/tooltip': MilkdownPluginTooltip,
  'kit/preset/commonmark': MilkdownPresetCommonmark,
  'kit/prose/inputrules': MilkdownProseInputrules,
  'kit/prose/model': MilkdownProseModel,
  'kit/prose/state': MilkdownProseState,
  'kit/prose/view': MilkdownProseView,
  'kit/utils': MilkdownUtils,
} as const;

export type MilkdownGlobals = typeof Milkdown;
