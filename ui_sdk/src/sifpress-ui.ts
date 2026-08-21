/**
 * Shared UI bundle entry — built by Vite into `ui-sdk.mjs` and served by the
 * backend at `?p=sifpress/asset/js/ui-sdk.mjs`. Both the admin SPA and the
 * sifront load it via `<script type="module" src=...>`. It exposes a single
 * global namespace (`window.SifpressUI`) so the two apps can externalize
 * React, the common libraries, the whole ui-sdk API, and Milkdown to one
 * shared instance instead of bundling duplicates.
 */

import * as React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactQuery from "@tanstack/react-query";
import * as ReactRouter from "@tanstack/react-router";
import * as i18next from "i18next";
import * as ReactI18next from "react-i18next";
import * as sdk from "./index";
import * as CrepeBuilder from "@milkdown/crepe/builder";
import * as CrepeFeatureBlockEdit from "@milkdown/crepe/feature/block-edit";
import * as CrepeFeatureCodeMirror from "@milkdown/crepe/feature/code-mirror";
import * as CrepeFeatureCursor from "@milkdown/crepe/feature/cursor";
import * as CrepeFeatureLatex from "@milkdown/crepe/feature/latex";
import * as CrepeFeatureLinkTooltip from "@milkdown/crepe/feature/link-tooltip";
import * as CrepeFeatureListItem from "@milkdown/crepe/feature/list-item";
import * as CrepeFeaturePlaceholder from "@milkdown/crepe/feature/placeholder";
import * as CrepeFeatureTable from "@milkdown/crepe/feature/table";
import * as CrepeFeatureToolbar from "@milkdown/crepe/feature/toolbar";
import * as MilkdownCore from "@milkdown/kit/core";
import * as MilkdownCtx from "@milkdown/kit/ctx";
import * as MilkdownPluginTooltip from "@milkdown/kit/plugin/tooltip";
import * as MilkdownPresetCommonmark from "@milkdown/kit/preset/commonmark";
import * as MilkdownProseInputrules from "@milkdown/kit/prose/inputrules";
import * as MilkdownProseModel from "@milkdown/kit/prose/model";
import * as MilkdownProseState from "@milkdown/kit/prose/state";
import * as MilkdownProseView from "@milkdown/kit/prose/view";
import * as MilkdownUtils from "@milkdown/kit/utils";

export interface SifpressUI {
	sdk: typeof sdk;
	React: typeof React;
	ReactJSXRuntime: typeof ReactJSXRuntime;
	ReactDOM: typeof ReactDOM;
	ReactDOMClient: typeof ReactDOMClient;
	ReactQuery: typeof ReactQuery;
	ReactRouter: typeof ReactRouter;
	i18next: typeof i18next;
	ReactI18next: typeof ReactI18next;
	Milkdown: {
		"crepe/builder": typeof CrepeBuilder;
		"crepe/feature/block-edit": typeof CrepeFeatureBlockEdit;
		"crepe/feature/code-mirror": typeof CrepeFeatureCodeMirror;
		"crepe/feature/cursor": typeof CrepeFeatureCursor;
		"crepe/feature/latex": typeof CrepeFeatureLatex;
		"crepe/feature/link-tooltip": typeof CrepeFeatureLinkTooltip;
		"crepe/feature/list-item": typeof CrepeFeatureListItem;
		"crepe/feature/placeholder": typeof CrepeFeaturePlaceholder;
		"crepe/feature/table": typeof CrepeFeatureTable;
		"crepe/feature/toolbar": typeof CrepeFeatureToolbar;
		"kit/core": typeof MilkdownCore;
		"kit/ctx": typeof MilkdownCtx;
		"kit/plugin/tooltip": typeof MilkdownPluginTooltip;
		"kit/preset/commonmark": typeof MilkdownPresetCommonmark;
		"kit/prose/inputrules": typeof MilkdownProseInputrules;
		"kit/prose/model": typeof MilkdownProseModel;
		"kit/prose/state": typeof MilkdownProseState;
		"kit/prose/view": typeof MilkdownProseView;
		"kit/utils": typeof MilkdownUtils;
	};
}

declare global {
	interface Window {
		SifpressUI?: SifpressUI;
	}
}

const api: SifpressUI = {
	sdk,
	React,
	ReactJSXRuntime,
	ReactDOM,
	ReactDOMClient,
	ReactQuery,
	ReactRouter,
	i18next,
	ReactI18next,
	Milkdown: {
		"crepe/builder": CrepeBuilder,
		"crepe/feature/block-edit": CrepeFeatureBlockEdit,
		"crepe/feature/code-mirror": CrepeFeatureCodeMirror,
		"crepe/feature/cursor": CrepeFeatureCursor,
		"crepe/feature/latex": CrepeFeatureLatex,
		"crepe/feature/link-tooltip": CrepeFeatureLinkTooltip,
		"crepe/feature/list-item": CrepeFeatureListItem,
		"crepe/feature/placeholder": CrepeFeaturePlaceholder,
		"crepe/feature/table": CrepeFeatureTable,
		"crepe/feature/toolbar": CrepeFeatureToolbar,
		"kit/core": MilkdownCore,
		"kit/ctx": MilkdownCtx,
		"kit/plugin/tooltip": MilkdownPluginTooltip,
		"kit/preset/commonmark": MilkdownPresetCommonmark,
		"kit/prose/inputrules": MilkdownProseInputrules,
		"kit/prose/model": MilkdownProseModel,
		"kit/prose/state": MilkdownProseState,
		"kit/prose/view": MilkdownProseView,
		"kit/utils": MilkdownUtils,
	},
};

Object.assign(window, { SifpressUI: api });

export default api;
