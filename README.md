# Commodity Dashboard

Local commodity dashboard project built from a static May 2026 snapshot.

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

## Important publishing note

The current dashboard is **not GitHub Pages-ready as-is**.

Why:

- GitHub Pages only serves static files
- this app currently depends on:
  - a Node server
  - SQLite reads
  - JSON API routes such as `/api/context`, `/api/map`, and `/api/search-index`

So:

- pushing this repo to GitHub is fine
- hosting the current app on GitHub Pages requires a later static-export/refactor step

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
