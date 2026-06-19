# Commodity Dashboard

Local commodity dashboard project built from a static May-June 2026 snapshot.

## Current stack

- source snapshot: `Agro Dashboard - new data.xlsx`
- local database: `data/agro_dashboard.db`
- local API: `local-dashboard/server.js`
- browser app: `local-dashboard/public/`

## Local run

```bash
npm install
npm run build:static-db
npm run dashboard:local
```

Open `http://127.0.0.1:3180`.

## GitHub Pages build

This repo now supports a static Pages build.

Build it with:

```bash
npm run build:pages
```

That command:

- exports the current SQLite-backed dataset into static JSON
- writes those files to `local-dashboard/public/data/`
- copies the deployable site into `docs/`

For GitHub Pages:

1. run `npm run build:pages`
2. commit the updated `docs/` folder
3. in GitHub repo settings, enable Pages from:
   - `Deploy from a branch`
   - branch: `main`
   - folder: `/docs`

## Architecture note

The original dashboard architecture was **not GitHub Pages-ready as-is**.

Why:

- GitHub Pages only serves static files
- this app currently depends on:
  - a Node server
  - SQLite reads
  - JSON API routes such as `/api/context`, `/api/map`, and `/api/search-index`

That is why the Pages build converts the live local data source into static JSON before deployment.

## What should go to GitHub

Recommended to push:

- `local-dashboard/`
- `scripts/`
- `appscript/` if you want to keep the legacy reference
- `CONTEXT.md`
- `AGENTS.md`
- `package.json`
- `package-lock.json`
- `README.md`
- `Agro Dashboard - new data.xlsx` if you want the source workbook in the repo

Excluded by `.gitignore`:

- `node_modules/`
- local DB files under `data/`
- build/output/temp folders
- logs

## Active localization file

The dashboard currently reads translations from:

- `local-dashboard/public/translations.json`
