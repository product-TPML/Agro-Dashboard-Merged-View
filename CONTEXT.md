# Commodity Dashboard Context

## Purpose

This repo is currently being used to build a **local commodity dashboard** backed by a **static local SQLite database**.

The active goal is:

- use the May 2026 snapshot as a fixed development dataset
- serve a local dashboard without Google Sheets dependencies
- keep the dataset read-only during the current phase
- implement the search-first dashboard flow from the wireframes

This repo is **not** operating as a live sync pipeline right now.

## Current Source of Truth

The current source workbook is:

- `Agro Dashboard - new data.xlsx`

That workbook is converted into the local SQLite database:

- `data/agro_dashboard.db`

Rebuild command:

- `npm run build:static-db`

## Current Architecture

Current development shape:

- `Agro Dashboard - new data.xlsx` -> `data/agro_dashboard.db` -> `local-dashboard/server.js` -> browser UI

Current runtime commands:

- `npm run build:static-db`
- `npm run dashboard:local`

The local dashboard is served at:

- `http://127.0.0.1:3180`

## Active Assumptions

The dataset is static for the current phase.

That means:

- no inserts
- no updates
- no deletes
- no rolling retention
- no live Google Sheets sync

If the workbook changes, the database is rebuilt from scratch.

## Main Files

- `CONTEXT.md`
  Current project context.

- `Agro Dashboard - new data.xlsx`
  Static workbook snapshot used to seed the DB.

- `data/agro_dashboard.db`
  Active local SQLite database for dashboard development.

- `data/README.md`
  Short notes on schema and rebuild usage.

- `scripts/build_static_db.js`
  Recreates the SQLite database from the workbook.

- `scripts/karnataka_market_district_mapping.json`
  Source file for district metadata and market-to-district geography used by the local DB.

- `local-dashboard/server.js`
  Local Node HTTP server and JSON API for the dashboard.

- `local-dashboard/public/index.html`
  HTML entry point for the local dashboard.

- `local-dashboard/public/styles.css`
  Dashboard styling.

- `local-dashboard/public/app.js`
  Client-side dashboard logic, routing, search, custom filter dropdowns, table rendering, and inline history.

- `local-dashboard/public/translations.json`
  Active translation source for commodity, market, and variety labels in English and Kannada.

- `package.json`
  Contains both `build:static-db` and `dashboard:local`.

- `appscript/`
  Legacy Google Apps Script dashboard and mapping UI. Kept only as reference.

- `scrape_krama.js`
  Legacy KRAMA scraper from the earlier Sheets-based workflow. Not part of the active local dashboard path.

## Database Model

The SQLite database is normalized for clean reads.

### Core tables

- `commodities`
- `commodity_mapping`
- `districts`
- `markets`
- `market_district_mapping`
- `varieties`
- `grades`
- `units`
- `price_observations`
- `scrape_runs`
- `source_snapshot`

### Read-focused views

- `price_observations_flat`
  Denormalized view for dashboard reads

- `latest_price_observations`
  Latest available row per `commodity + market + variety + grade`

## Imported Dataset Summary

Current static snapshot:

- `price_observations`: 20,041 rows
- `commodity_mapping`: 133 rows
- `districts`: 31 rows
- `market_district_mapping`: 163 rows
- `scrape_runs`: 45 rows
- 133 commodities
- 163 markets
- 236 varieties
- 6 grades
- report dates from `2026-05-02` through `2026-05-31`

## Data Semantics

The workbook includes three logical datasets:

- `prices`
- `commodity_mapping`
- `runs`

They were mapped into SQLite as:

- `prices` -> `price_observations` plus dimension tables
- `commodity_mapping` -> `commodity_mapping`
- `runs` -> `scrape_runs`
- district geography -> `districts` and `market_district_mapping`

Active row-level fields used in the dashboard:

1. `row_key`
2. `report_date`
3. `heading`
4. `commodity`
5. `perishability`
6. `market`
7. `variety`
8. `grade`
9. `arrivals`
10. `unit`
11. `min_price`
12. `max_price`
13. `modal_price`
14. `scraped_at`

The flattened read view now also includes:

1. `district`
2. `district_slug`

## Implemented Dashboard Flow

The current dashboard follows the wireframe direction as a **search-first flow**.

### Home screen

The home screen currently includes:

- dashboard branding/header
- global search bar
- interactive Karnataka district map

Search remains the active primary navigation path, but the district map is now wired into the home screen.

### Search behavior

The global search supports:

- commodity search
- market search
- variety search

Search result priority:

1. commodity
2. market
3. variety

Search result labeling:

- `Tomato (Commodity)`
- `Mysuru (Market)`
- `Local (Tomato)`

Variety results are always shown in the form:

- `Variety (Commodity)`

### Table page behavior

There is one shared table view with pre-applied context.

#### Commodity search

- locked heading: commodity
- filters: market, variety

#### Market search

- locked heading: market
- filters: commodity, variety

#### Variety search

- locked headings: commodity and variety
- filter: market

### Filters

Filters are cascading.

That means:

- only valid combinations are shown
- impossible combinations are not available in dropdowns

The current filter UI uses custom in-app dropdown menus instead of native browser `select` popups so the menus stay visually contained inside the dashboard card on mobile.

### Geography layer

The local DB now includes a district geography layer used by the home-screen map.

Current structure:

- `districts`
  current Karnataka district list used by the local dashboard

- `market_district_mapping`
  one market-to-district assignment for each market in the static dataset

This mapping now supports:

- district click -> market pins for that district
- market pin click -> route to the market table

Most mappings follow district/taluk geography directly. A small number of market names were normalized or inferred because the workbook uses abbreviated or inconsistent labels, for example:

- `ENDI` -> treated as `Indi` in Vijayapura district
- `YARAHALLI` -> mapped to the APMC yard reference in H. D. Kote taluk, Mysuru district

### Table data behavior

The current table shows:

- the latest row only for each exact `commodity + market + variety + grade` combination after applying the selected context and active filters
- rows sorted by `market`
- `arrivals + unit` merged into a single column labeled `Arrivals And Units`
- price columns labeled with rupee units:
  - `Max Price (Rs.)`
  - `Min Price (Rs.)`
  - `Modal Price (Rs.)`
- two trailing date columns:
  - `Latest Price Update At`
  - `Previous Price Update At`

The table does not show `report_date` as a standalone column.

For each row, the price cells also show the absolute change from the previous comparable update for the exact:

- `commodity + market + variety + grade`

Delta behavior:

- increase -> green rising indicator with `(+value)`
- decrease -> red falling indicator with `(-value)`
- no change -> `(0)`
- no earlier comparable row -> `No earlier update`

Both table date columns use `DD-MM-YYYY`.

### Row expansion

Clicking a row expands an **inline history panel** for the exact:

- `commodity + market + variety + grade`

The history panel shows:

- min price
- max price
- modal price
- fixed visual mapping:
  - max price -> green solid line
  - min price -> red solid line
  - modal price -> yellow dotted line
- point markers for each plotted date
- latest date active by default when the chart opens
- hover/tap selection for any plotted date
- an in-chart value tooltip plus a compact summary block for the selected date
- x-axis dates in `DD-MM`
- tooltip and selected-date displays in `DD-MM-YYYY`

When multiple series overlap, all three remain visible. The chart draws `max` last so it stays visually strongest without hiding `min` or `modal`.

### Hardcoded history windows

History window is determined by perishability and is not user-selectable:

- perishable -> last 7 days
- non-perishable -> last 30 days

## Current API Surface

The local server currently exposes:

- `/api/health`
- `/api/map`
- `/api/search?q=...`
- `/api/search-index`
- `/api/context?type=commodity&commodity=...`
- `/api/context?type=market&market=...`
- `/api/context?type=variety&commodity=...&variety=...`

### API responsibilities

- `/api/search`
  returns prioritized search results

- `/api/search-index`
  returns the raw commodity, market, and variety catalog used for client-side bilingual search matching

- `/api/map`
  returns district-level market mapping for the home-screen map

- `/api/context`
  returns table context metadata and all matching rows for the selected search type

- `/api/health`
  simple server + DB health check

## Current UI Status

Implemented and working:

- local server
- home screen
- search suggestion flow
- route into shared table page
- locked context headings
- cascading filters
- custom filter dropdown menus contained within the card on mobile
- latest-row-only table
- merged `Arrivals And Units` column
- table price deltas against the previous comparable update
- `Latest Price Update At` and `Previous Price Update At` date columns
- inline row expansion
- inline price history chart
- selected-point chart tooltip and summary values
- interactive district map on the home screen
- district click-to-zoom using SVG `viewBox` focus
- manual map panning inside the map container
- touch pinch-to-zoom and wheel-based zoom adjustments on the map
- district-scoped market pins rendered inside the selected district
- market pin click -> market table route
- mobile-friendly stacked layout for home and table pages
- bounded table container with horizontal and vertical scrolling
- sticky header row inside the scrolling table container
- scroll position preserved when selecting a different chart point
- local district and market geography used by the home-screen map
- English/Kannada toggle persisted in browser storage
- translated commodity, market, and variety labels across suggestions, headings, filters, table cells, history titles, and map market labels
- bilingual search matching so Kannada and English input both resolve while results render in the active language

Not implemented yet:

- additional summary widgets
- movers / top-changes module
- production packaging for the local dashboard

## Known Decisions

### Chosen

- use SQLite as the active datastore
- use the workbook as the rebuild source
- keep the current dataset static
- build a local Node-served HTML dashboard
- make search the primary navigation path
- keep row history inline in the table
- use the local district map as a secondary navigation path from home

### Not chosen

- live Google Sheets reads
- write-through editing in the local app
- direct Excel reads from the browser
- giant JSON as the primary source of truth
- latest-row-only table behavior for the current search-driven build

## Historical Context

This repo originally supported a different workflow:

- scrape KRAMA data
- write to Google Sheets
- manage perishability through Apps Script
- serve a dashboard from Apps Script HTML

That older workflow still exists in the codebase as reference, but it is **not the active architecture now**.

Reference-only files from that workflow:

- `scrape_krama.js`
- `scripts/backfill_perishability.js`
- `appscript/Code.gs`
- `appscript/CommodityMapping.html`
- `appscript/Dashboard.html`

## Operational Notes

- rebuild the DB whenever the workbook changes:
  - `npm run build:static-db`

- start the local dashboard server with:
  - `npm run dashboard:local`

- DB path:
  - `data/agro_dashboard.db`

- for simple row reads, prefer:
  - `price_observations_flat`

- for latest-row-per-entry reads, prefer:
  - `latest_price_observations`

## Current Map Notes

The active home-screen map now uses:

- `local-dashboard/public/karnataka-geo.svg`

That SVG is now sourced from a better district map asset copied from the locally cloned `karnataka-budget-expectations` repo.

The map now supports:

- district click
- district zoom
- manual panning inside the map viewport
- touch pinch zoom and pointer/wheel zoom without changing the existing district-selection flow
- market-pin generation from `market_district_mapping`
- in-SVG labeled market markers placed from district geometry sampling
- market pin click -> market table navigation
- direct district-path click handling on the integrated SVG asset
- zoom in / zoom out / reset controls based on the active SVG `viewBox`

Current source limitation:

- the current SVG source contains `30` districts, not `31`
- `Ramanagara` is present
- `Vijayanagara` is not present in the current SVG source, even though it exists in the local DB

## Immediate Next Step

The next practical work is to refine the local dashboard UI and expand any remaining localization coverage beyond commodity, market, and variety names if needed.
