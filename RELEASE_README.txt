KRAMA Sync Desktop Runner

Files that must stay together in the same folder:

- krama-sync.exe
- .env
- node_modules\
- ms-playwright\

How to run:

1. Double-click krama-sync.exe
2. A date-picker UI opens in your browser
3. Select the report date
4. Click Fetch Data
5. Wait for the scrape and Sheets sync to finish

What the app writes:

- logs\ for run logs

Google Sheets behavior:

- prices sheet receives upserts keyed by report date + commodity + market + variety + grade
- prices sheet is pruned to the last 30 calendar days based on report_date
- runs sheet receives one row per execution
- timestamps written to Sheets are in IST (+05:30)

Important notes:

- .env must sit beside krama-sync.exe
- no local JSON or CSV files are written
- if the HTTP scrape path fails, the app falls back to Playwright using the bundled browser runtime

If the run fails:

- open the latest file in logs\
- check that .env is present and contains the correct Google credentials
