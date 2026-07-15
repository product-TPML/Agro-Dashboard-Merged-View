# Repo Cleanup Audit

This file is a decision aid for repository cleanup. It is based on the current project structure and build flow as of 2026-07-10.

## Current Hosting Model

- GitHub Pages serves `docs/`
- `scripts/build_pages_site.js` rebuilds static JSON into `local-dashboard/public/data/`
- `scripts/build_pages_site.js` then copies `local-dashboard/public/` into `docs/`

Implication:

- `docs/` is the deployed artifact
- `local-dashboard/public/` is the editable source copy of the same static site
- `local-dashboard/server.js` is only for local Node-based serving

## Required For Current GitHub Pages Hosting

These are the files/folders needed if the repo’s only purpose is to host the already-built site on GitHub Pages:

- `docs/`
- `README.md` if you want project documentation in the repo
- optional repo metadata such as `.gitignore`, `AGENTS.md`, `CONTEXT.md`

Strictly for Pages runtime, only `docs/` matters.

## Required To Rebuild The Site

Keep these if you want to continue regenerating `docs/` from source:

- `local-dashboard/public/`
- `scripts/build_pages_site.js`
- `scripts/build_static_db.js`
- `scripts/commodity_category_mapping.json`
- `scripts/karnataka_market_district_mapping.json`
- `package.json`
- `package-lock.json`
- `data/agro_dashboard.db` or the upstream inputs needed to regenerate it
- `Agro Dashboard - new data.xlsx`

Keep these as well if you want to continue scraping or updating the local DB:

- `scrape_krama.js`
- supporting scripts under `scripts/`

## Duplicate Or Generated Content

These are duplicated by the current build flow:

- `local-dashboard/public/app.js` -> copied to `docs/app.js`
- `local-dashboard/public/index.html` -> copied to `docs/index.html`
- `local-dashboard/public/styles.css` -> copied to `docs/styles.css`
- `local-dashboard/public/translations.json` -> copied to `docs/translations.json`
- `local-dashboard/public/karnataka-geo.svg` -> copied to `docs/karnataka-geo.svg`
- `local-dashboard/public/fonts/` -> copied to `docs/fonts/`
- `local-dashboard/public/data/` -> copied to `docs/data/`

Decision note:

- if the repo is only for hosting, `local-dashboard/public/` is not required
- if the repo is for source + rebuilds, `docs/` is the generated copy and must remain only because Pages deploys from `/docs`

## Local-Only Or Generated Artifacts

These do not appear necessary for GitHub Pages hosting and are local/debug/build artifacts:

- `node_modules/`
- `dist/`
- `logs/`
- `output/`
- `temp/`
- `.tmp/`
- `.playwright-cli/`
- `data/agro_dashboard.db-shm`
- `data/agro_dashboard.db-wal`

These are already mostly covered by `.gitignore`, but they should not be treated as meaningful repo content.

## Local Development Only

These are useful for local workflows but not for the hosted static site:

- `local-dashboard/server.js`
- `Launch Commodity Scraper.vbs`
- `RELEASE_README.txt`

## Workflow / Automation Optional

Keep these only if you still want repo-managed automation:

- `.github/workflows/scrape.yml`

This workflow is not required for Pages hosting itself. It is only relevant if you want the self-hosted scrape/update workflow to remain in the repo.

## Reference / Design / Historical Files

These do not affect site runtime and look like reference material, design artifacts, or historical samples:

- `screens/`
- `appscript/`
- `Agro dashboard wireframes.drawio (1).pdf`
- `krama_commodity_2026-05-22.csv`
- `krama_commodity_2026-05-22.json`

## Map Source Assets Likely Optional

These appear to be source or reference assets used to derive current map files, not direct runtime dependencies of the hosted site:

- `District.kmz`
- `District.pdf`
- `District_Boundaries.gpkg`
- `karnataka.geojson`
- `India_Karnataka_location_map.svg`
- `Karnataka_districts_map.svg`
- `Map_of_Karnataka.svg`
- `vecteezy_karnataka-state-map-with-all-district-white-background_60307070.eps`
- `vecteezy_karnataka-state-map-with-all-district-white-background_60307070.jpg`
- `Vecteezy-License-Information.pdf`

Keep these only if you want to preserve map-source provenance or future map-regeneration inputs.

## Possible Cleanup Modes

### Mode 1: Host Only

Keep:

- `docs/`
- minimal repo docs such as `README.md`

Everything else becomes optional.

### Mode 2: Host + Rebuild Static Site

Keep:

- `docs/`
- `local-dashboard/public/`
- `scripts/build_pages_site.js`
- `scripts/build_static_db.js`
- `package.json`
- `package-lock.json`
- DB/workbook inputs

You can still remove most local/debug/reference artifacts.

### Mode 3: Full Maintenance Repo

Keep:

- hosting files
- rebuild files
- scraper files
- workbook
- workflow files

Still safe to ignore/remove local generated outputs and debug artifacts.

## Open Decisions

- Do you want the repo to be only a Pages deployment repo, or also the source-of-truth for rebuilding?
- Do you want to preserve scraper capability in this repo?
- Do you want to preserve self-hosted GitHub Actions scrape automation?
- Do you want to keep design/reference/history assets in version control?
- Do you want to keep both `docs/` and `local-dashboard/public/`, or eventually switch deployment strategy so only one copy is committed?

## Practical First Candidates For Removal Or Archival

If cleanup starts conservatively, the first low-risk candidates are:

- `output/`
- `logs/`
- `temp/`
- `.tmp/`
- `.playwright-cli/`
- root sample exports like `krama_commodity_2026-05-22.csv` and `krama_commodity_2026-05-22.json`
- `screens/` if design snapshots are no longer needed

## Notes

- This file is informational only. No deletion decisions have been applied yet.
- Revisit this file before removing anything that is part of the rebuild or scrape pipeline.
