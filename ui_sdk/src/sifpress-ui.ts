/**
 * Shared UI bundle entry — built by Vite into `ui-sdk.mjs` and served by the
 * backend at `?p=sifpress/asset/js/ui-sdk.mjs`. Both the admin SPA and the
 * sifront load it via `<script type="module" src=...>`. It exposes a single
 * global namespace (`window.SifpressUI`) so the two apps can externalize
 * React, the common libraries, the whole ui-sdk API, and Milkdown to one
 * shared instance instead of bundling duplicates.
 */

import * as React from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactQuery from '@tanstack/react-query';
import * as ReactRouter from '@tanstack/react-router';
import * as i18next from 'i18next';
import * as ReactI18next from 'react-i18next';
import * as sdk from './index';

export interface SifpressUI {
  sdk: typeof sdk;
  Libs?: Record<string, unknown>;
  React: typeof React;
  ReactJSXRuntime: typeof ReactJSXRuntime;
  ReactDOM: typeof ReactDOM;
  ReactDOMClient: typeof ReactDOMClient;
  ReactQuery: typeof ReactQuery;
  ReactRouter: typeof ReactRouter;
  i18next: typeof i18next;
  ReactI18next: typeof ReactI18next;
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
};

Object.assign(window, {
  SifpressUI: window.SifpressUI === undefined ? api : { ...api, Libs: window.SifpressUI.Libs },
});

export default api;
