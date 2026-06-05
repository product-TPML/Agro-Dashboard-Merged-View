# Commodity Mapping Apps Script

This Apps Script adds a Sheet-bound UI for maintaining commodity perishability without rebuilding the desktop scraper.

## What it does

- adds a custom menu: `KRAMA Tools`
- opens a sidebar UI inside Google Sheets
- reads all unique commodities from the `prices` sheet
- stores mapping in a `commodity_mapping` sheet
- lets users set `perishable` / `non-perishable` using dropdowns
- applies the mapping to all matching rows in `prices`

## Files

- `Code.gs`
- `CommodityMapping.html`
- `appsscript.json`

## Expected sheets

- `prices`
- `runs`
- `commodity_mapping`

The script will create `commodity_mapping` if it does not exist.

## Setup

1. Open the target Google Sheet.
2. Open `Extensions` -> `Apps Script`.
3. Copy these files into the Apps Script project.
4. If the script is bound to the same spreadsheet, leave `APP_CONFIG.spreadsheetId` blank.
5. Reload the spreadsheet.
6. Use the `KRAMA Tools` menu.

## Workflow

1. Run the desktop scraper as usual.
2. Open `KRAMA Tools` -> `Open Commodity Mapping`.
3. Set dropdown values for commodities.
4. Click `Save Mapping`.
5. Click `Apply To Prices`.

## Notes

- The desktop scraper no longer owns the perishability mapping.
- The scraper preserves existing `perishability` values during upserts.
- New commodities will appear unmapped in the sidebar until you classify them.
