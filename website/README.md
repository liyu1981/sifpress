# Sifpress project website

A dependency-free static landing page for Sifpress, styled after the
`sifronts/sifpress1` frontend: Geist Variable typography, shadcn/oklch light +
dark tokens, the glass system (`glass-control` / `apple-panel` / `ambient-bg`),
the rainbow hover cards and the drifting ambient canvas background.

Everything is plain HTML/CSS/JS — **no build step**. The Geist variable font
(latin + latin-ext, from `@fontsource-variable/geist`, OFL-licensed) is vendored
into `assets/fonts/` so the page has zero third-party runtime requests.

## Structure

```
website/
├── index.html          landing page (single scroll, anchor nav)
├── .nojekyll           tell GitHub Pages not to run Jekyll
├── README.md
└── assets/
    ├── site.css        tokens + glass system + layout (ported from sifpress1)
    ├── site.js         theme cycling, ambient canvas, copy buttons,
    │                   scroll reveal, scroll-spy
    ├── logo.svg        project logo (sage badge; repo assets/favicon_optimized.svg)
    └── fonts/          Geist Variable woff2 subsets
```

## Theme behavior

`index.html` runs a tiny inline script before first paint that reads
`localStorage.theme` (`light` | `dark` | `system`, default `system`) and sets
the `dark` class + `data-theme` on `<html>` — identical conventions to
`sifpress1` (`localStorage` key `theme`). The header button cycles
light → dark → system.

## Preview locally

Any static file server works, e.g.:

```bash
php -S localhost:8000 -t website
# or
python3 -m http.server 8000 --directory website
```

Then open <http://localhost:8000>.

All asset paths are **relative** (`assets/...`), so the site works both at the
domain root and under a project subpath (`https://<user>.github.io/sifpress/`).

## Publishing to GitHub Pages

The repo ships a workflow at `.github/workflows/pages.yml` that deploys the
`website/` folder on every push to `master` **or** `main` that touches
`website/**` (plus manual `workflow_dispatch`).

One-time setup:

1. GitHub → **Settings → Pages → Build and deployment → Source**:
   select **GitHub Actions**.
2. Push this repo (or merge to `master`/`main` with `website/**` in the diff).
3. The **Pages** workflow run publishes `website/` as the site root; the job
   output shows the live URL
   (`https://<user>.github.io/sifpress/`).

`.nojekyll` is included so Pages serves the assets as-is. The workflow uploads
only the `website/` folder, so nothing from the PHP build (or `dist/`) leaks
into the published site.

### Alternative: deploy from a branch

If you prefer branch-based Pages, copy the contents of `website/` to the root
of a `gh-pages` branch (e.g. with `git subtree`):

```bash
git subtree push --prefix website origin gh-pages
```

Then set **Settings → Pages → Source: Deploy from a branch** → `gh-pages` /
`/ (root)`.

## Updating content

- Copy lives entirely in `index.html`.
- Design tokens / glass classes are ported from
  `sifronts/sifpress1/src/index.css` — if that file changes, mirror the token
  blocks here (plain CSS, no Tailwind).
- No formatter applies to this folder (Biome only covers `src/**` in the pnpm
  packages); keep the existing style manually.
