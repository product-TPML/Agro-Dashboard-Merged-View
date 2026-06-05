const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const Database = require("better-sqlite3");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_WORKBOOK = path.join(ROOT_DIR, "Agro Dashboard - new data.xlsx");
const MARKET_DISTRICT_MAPPING_FILE = path.join(__dirname, "karnataka_market_district_mapping.json");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "agro_dashboard.db");

const REQUIRED_SHEETS = ["prices", "commodity_mapping", "runs"];
const PERISHABILITY_VALUES = new Set(["perishable", "non-perishable"]);

function main() {
  ensureWorkbookExists();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const workbook = XLSX.readFile(SOURCE_WORKBOOK);
  validateSheets(workbook);
  const geography = readMarketDistrictMapping();

  const prices = readRows(workbook.Sheets.prices);
  const mappings = readRows(workbook.Sheets.commodity_mapping);
  const runs = readRows(workbook.Sheets.runs);

  const db = new Database(DB_PATH);
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    createSchema(db);
    importStaticData(db, prices, mappings, runs, geography);
    printSummary(db);
  } finally {
    db.close();
  }
}

function ensureWorkbookExists() {
  if (!fs.existsSync(SOURCE_WORKBOOK)) {
    throw new Error(`Workbook not found: ${SOURCE_WORKBOOK}`);
  }
}

function validateSheets(workbook) {
  for (const sheetName of REQUIRED_SHEETS) {
    if (!workbook.Sheets[sheetName]) {
      throw new Error(`Missing required sheet: ${sheetName}`);
    }
  }
}

function readMarketDistrictMapping() {
  if (!fs.existsSync(MARKET_DISTRICT_MAPPING_FILE)) {
    throw new Error(`Market mapping file not found: ${MARKET_DISTRICT_MAPPING_FILE}`);
  }

  const payload = JSON.parse(fs.readFileSync(MARKET_DISTRICT_MAPPING_FILE, "utf8"));
  if (!Array.isArray(payload.districts) || !Array.isArray(payload.marketMappings)) {
    throw new Error("Market mapping file must contain districts and marketMappings arrays.");
  }

  return payload;
}

function readRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  }).map(trimObjectStrings);
}

function trimObjectStrings(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = typeof value === "string" ? value.trim() : value;
  }
  return normalized;
}

function parseNumber(value, fieldName) {
  const text = String(value).trim();
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${fieldName}: ${value}`);
  }
  return parsed;
}

function normalizePerishability(value) {
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return "";
  }
  if (!PERISHABILITY_VALUES.has(text)) {
    throw new Error(`Unexpected perishability value: ${value}`);
  }
  return text;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE source_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_file TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      prices_row_count INTEGER NOT NULL,
      mapping_row_count INTEGER NOT NULL,
      runs_row_count INTEGER NOT NULL
    );

    CREATE TABLE commodities (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      perishability TEXT CHECK (perishability IN ('perishable', 'non-perishable'))
    );

    CREATE TABLE commodity_mapping (
      commodity_id INTEGER PRIMARY KEY REFERENCES commodities(id),
      perishability TEXT NOT NULL CHECK (perishability IN ('perishable', 'non-perishable')),
      updated_at TEXT
    );

    CREATE TABLE markets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE districts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE market_district_mapping (
      market_id INTEGER PRIMARY KEY REFERENCES markets(id),
      district_id INTEGER NOT NULL REFERENCES districts(id),
      notes TEXT
    );

    CREATE TABLE varieties (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE grades (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE units (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE price_observations (
      id INTEGER PRIMARY KEY,
      row_key TEXT NOT NULL UNIQUE,
      report_date TEXT NOT NULL,
      heading TEXT NOT NULL,
      commodity_id INTEGER NOT NULL REFERENCES commodities(id),
      market_id INTEGER NOT NULL REFERENCES markets(id),
      variety_id INTEGER NOT NULL REFERENCES varieties(id),
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      arrivals REAL NOT NULL,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      min_price REAL NOT NULL,
      max_price REAL NOT NULL,
      modal_price REAL NOT NULL,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE scrape_runs (
      run_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      report_date TEXT NOT NULL,
      status TEXT NOT NULL,
      commodity_count INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      output_dir TEXT,
      json_path TEXT,
      csv_path TEXT,
      log_path TEXT,
      notes TEXT
    );

    CREATE INDEX idx_price_observations_report_date
      ON price_observations (report_date);

    CREATE INDEX idx_price_observations_commodity_date
      ON price_observations (commodity_id, report_date);

    CREATE INDEX idx_price_observations_market_date
      ON price_observations (market_id, report_date);

    CREATE INDEX idx_price_observations_dashboard_lookup
      ON price_observations (commodity_id, market_id, variety_id, grade_id, report_date);

    CREATE VIEW price_observations_flat AS
    SELECT
      po.id,
      po.row_key,
      po.report_date,
      po.heading,
      c.name AS commodity,
      COALESCE(cm.perishability, c.perishability) AS perishability,
      m.name AS market,
      d.name AS district,
      d.slug AS district_slug,
      v.name AS variety,
      g.name AS grade,
      po.arrivals,
      u.name AS unit,
      po.min_price,
      po.max_price,
      po.modal_price,
      po.scraped_at
    FROM price_observations po
    JOIN commodities c ON c.id = po.commodity_id
    LEFT JOIN commodity_mapping cm ON cm.commodity_id = c.id
    JOIN markets m ON m.id = po.market_id
    LEFT JOIN market_district_mapping mdm ON mdm.market_id = m.id
    LEFT JOIN districts d ON d.id = mdm.district_id
    JOIN varieties v ON v.id = po.variety_id
    JOIN grades g ON g.id = po.grade_id
    JOIN units u ON u.id = po.unit_id;

    CREATE VIEW latest_price_observations AS
    SELECT f.*
    FROM price_observations_flat f
    JOIN (
      SELECT
        commodity,
        market,
        district,
        variety,
        grade,
        MAX(report_date) AS latest_report_date
      FROM price_observations_flat
      GROUP BY commodity, market, district, variety, grade
    ) latest
      ON latest.commodity = f.commodity
     AND latest.market = f.market
     AND latest.district IS f.district
     AND latest.variety = f.variety
     AND latest.grade = f.grade
     AND latest.latest_report_date = f.report_date;
  `);
}

function importStaticData(db, prices, mappings, runs, geography) {
  const insertCommodity = db.prepare(`
    INSERT INTO commodities (name, perishability)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET
      perishability = COALESCE(excluded.perishability, commodities.perishability)
  `);
  const insertMarket = db.prepare("INSERT OR IGNORE INTO markets (name) VALUES (?)");
  const insertDistrict = db.prepare(`
    INSERT INTO districts (name, slug)
    VALUES (?, ?)
  `);
  const insertVariety = db.prepare("INSERT OR IGNORE INTO varieties (name) VALUES (?)");
  const insertGrade = db.prepare("INSERT OR IGNORE INTO grades (name) VALUES (?)");
  const insertUnit = db.prepare("INSERT OR IGNORE INTO units (name) VALUES (?)");
  const insertMarketDistrictMapping = db.prepare(`
    INSERT INTO market_district_mapping (market_id, district_id, notes)
    VALUES (?, ?, ?)
  `);
  const insertMapping = db.prepare(`
    INSERT INTO commodity_mapping (commodity_id, perishability, updated_at)
    VALUES (?, ?, ?)
  `);
  const insertPrice = db.prepare(`
    INSERT INTO price_observations (
      row_key,
      report_date,
      heading,
      commodity_id,
      market_id,
      variety_id,
      grade_id,
      arrivals,
      unit_id,
      min_price,
      max_price,
      modal_price,
      scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRun = db.prepare(`
    INSERT INTO scrape_runs (
      run_id,
      started_at,
      finished_at,
      report_date,
      status,
      commodity_count,
      row_count,
      output_dir,
      json_path,
      csv_path,
      log_path,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO source_snapshot (
      id,
      source_file,
      imported_at,
      prices_row_count,
      mapping_row_count,
      runs_row_count
    ) VALUES (1, ?, ?, ?, ?, ?)
  `);

  const loadAll = db.transaction(() => {
    for (const row of prices) {
      insertCommodity.run(row.commodity, normalizePerishability(row.perishability) || null);
      insertMarket.run(row.Market);
      insertVariety.run(row.Variety);
      insertGrade.run(row.Grade);
      insertUnit.run(row.Units);
    }

    for (const row of mappings) {
      insertCommodity.run(row.commodity, normalizePerishability(row.perishability) || null);
    }

    for (const district of geography.districts) {
      insertDistrict.run(district.name, district.slug);
    }

    const commodityIds = getLookupMap(db, "commodities");
    const marketIds = getLookupMap(db, "markets");
    const districtIds = getLookupMap(db, "districts");
    const varietyIds = getLookupMap(db, "varieties");
    const gradeIds = getLookupMap(db, "grades");
    const unitIds = getLookupMap(db, "units");

    validateMarketDistrictCoverage(marketIds, geography.marketMappings, districtIds);

    for (const row of geography.marketMappings) {
      insertMarketDistrictMapping.run(
        marketIds.get(row.market),
        districtIds.get(row.district),
        row.notes || null
      );
    }

    for (const row of mappings) {
      insertMapping.run(
        commodityIds.get(row.commodity),
        normalizePerishability(row.perishability),
        row.updated_at || null
      );
    }

    for (const row of prices) {
      insertPrice.run(
        row.row_key,
        row.report_date,
        row.heading,
        commodityIds.get(row.commodity),
        marketIds.get(row.Market),
        varietyIds.get(row.Variety),
        gradeIds.get(row.Grade),
        parseNumber(row.Arrivals, "Arrivals"),
        unitIds.get(row.Units),
        parseNumber(row["Min (Rs.)"], "Min (Rs.)"),
        parseNumber(row["Max (Rs.)"], "Max (Rs.)"),
        parseNumber(row["Modal (Rs.)"], "Modal (Rs.)"),
        row.scraped_at
      );
    }

    for (const row of runs) {
      insertRun.run(
        row.run_id,
        row.started_at,
        row.finished_at,
        row.report_date,
        row.status,
        parseNumber(row.commodity_count, "commodity_count"),
        parseNumber(row.row_count, "row_count"),
        row.output_dir || null,
        row.json_path || null,
        row.csv_path || null,
        row.log_path || null,
        row.notes || null
      );
    }

    insertSnapshot.run(
      path.basename(SOURCE_WORKBOOK),
      new Date().toISOString(),
      prices.length,
      mappings.length,
      runs.length
    );
  });

  loadAll();
}

function validateMarketDistrictCoverage(marketIds, marketMappings, districtIds) {
  const mappedMarkets = new Set();

  for (const row of marketMappings) {
    if (!marketIds.has(row.market)) {
      throw new Error(`District mapping refers to unknown market: ${row.market}`);
    }
    if (!districtIds.has(row.district)) {
      throw new Error(`District mapping refers to unknown district: ${row.district}`);
    }
    mappedMarkets.add(row.market);
  }

  const missingMarkets = [...marketIds.keys()].filter((market) => !mappedMarkets.has(market));
  if (missingMarkets.length) {
    throw new Error(`Missing district mappings for markets: ${missingMarkets.join(", ")}`);
  }
}

function getLookupMap(db, tableName) {
  const rows = db.prepare(`SELECT id, name FROM ${tableName}`).all();
  return new Map(rows.map((row) => [row.name, row.id]));
}

function printSummary(db) {
  const summary = db.prepare(`
    SELECT
      (SELECT prices_row_count FROM source_snapshot WHERE id = 1) AS prices_rows,
      (SELECT mapping_row_count FROM source_snapshot WHERE id = 1) AS mapping_rows,
      (SELECT runs_row_count FROM source_snapshot WHERE id = 1) AS run_rows,
      (SELECT COUNT(*) FROM commodities) AS commodities,
      (SELECT COUNT(*) FROM markets) AS markets,
      (SELECT COUNT(*) FROM districts) AS districts,
      (SELECT COUNT(*) FROM market_district_mapping) AS market_district_mappings,
      (SELECT COUNT(*) FROM varieties) AS varieties,
      (SELECT COUNT(*) FROM grades) AS grades,
      (SELECT COUNT(*) FROM latest_price_observations) AS latest_rows
  `).get();

  console.log(JSON.stringify({
    dbPath: DB_PATH,
    ...summary,
  }, null, 2));
}

main();
