const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT_DIR = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT_DIR, "data", "agro_dashboard.db");
const PUBLIC_DIR = path.join(ROOT_DIR, "local-dashboard", "public");
const PUBLIC_DATA_DIR = path.join(PUBLIC_DIR, "data");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const SOURCE_PRICE_DISPLAY_UNITS = {
  necc_egg: "100 eggs",
  csb_silk: "Kg",
  spices_board: "per KG",
  coffee_board: "50 Kg",
  rubber_board: "per 100 kg",
};

function main() {
  ensureDatabaseExists();
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  try {
    const observations = db.prepare(`
      SELECT
        row_key,
        report_date,
        source_id,
        commodity,
        perishability,
        category,
        market,
        variety,
        grade,
        arrivals,
        unit,
        min_price,
        max_price,
        modal_price,
        canonical_price,
        canonical_price_unit
      FROM price_observations_flat
      ORDER BY report_date ASC, commodity ASC, market ASC, variety ASC, grade ASC
    `).all().map(mapObservationRow);

    const searchIndex = {
      commodities: db.prepare("SELECT name FROM commodities ORDER BY name ASC").all().map((row) => row.name),
      markets: db.prepare("SELECT name FROM markets ORDER BY name ASC").all().map((row) => row.name),
      varieties: db.prepare(`
        SELECT DISTINCT commodity, variety
        FROM price_observations_flat
        WHERE variety <> ''
        ORDER BY variety ASC, commodity ASC
      `).all().map((row) => ({
        commodity: row.commodity,
        variety: row.variety,
      })),
    };

    const categoryData = buildCategoryData(db);
    const mapData = {
      districts: buildMapDistricts(db),
    };

    const metadata = {
      generatedAt: new Date().toISOString(),
      observations: observations.length,
      commodities: searchIndex.commodities.length,
      markets: searchIndex.markets.length,
      varieties: searchIndex.varieties.length,
    };

    fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
    writeJson(path.join(PUBLIC_DATA_DIR, "observations.json"), observations);
    writeJson(path.join(PUBLIC_DATA_DIR, "search-index.json"), searchIndex);
    writeJson(path.join(PUBLIC_DATA_DIR, "categories.json"), categoryData);
    writeJson(path.join(PUBLIC_DATA_DIR, "map-data.json"), mapData);
    writeJson(path.join(PUBLIC_DATA_DIR, "metadata.json"), metadata);

    rebuildDocs();

    console.log(`Built GitHub Pages site in ${DOCS_DIR}`);
  } finally {
    db.close();
  }
}

function mapObservationRow(row) {
  return {
    rowKey: row.row_key,
    reportDate: normalizeReportDateValue(row.report_date),
    sourceId: row.source_id,
    commodity: row.commodity,
    perishability: row.perishability,
    category: row.category,
    market: row.market,
    variety: row.variety,
    grade: row.grade,
    arrivals: row.arrivals,
    unit: row.unit,
    minPrice: row.min_price,
    maxPrice: row.max_price,
    modalPrice: row.modal_price,
    canonicalPrice: row.canonical_price,
    canonicalPriceUnit: row.canonical_price_unit,
    priceDisplayUnit: getPriceDisplayUnit(row),
  };
}

function normalizeReportDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  let match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    return `${match[3]}-${padDatePart(match[2])}-${padDatePart(match[1])}`;
  }

  match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    return `${match[3]}-${padDatePart(match[2])}-${padDatePart(match[1])}`;
  }

  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${padDatePart(match[2])}-${padDatePart(match[1])}`;
  }

  return raw;
}

function padDatePart(value) {
  return String(value || "").padStart(2, "0");
}

function getPriceDisplayUnit(row) {
  if (row.source_id === "spices_board" || row.source_id === "rubber_board" || row.source_id === "necc_egg") {
    return row.canonical_price_unit || SOURCE_PRICE_DISPLAY_UNITS[row.source_id] || null;
  }
  if (row.source_id === "coffee_board") {
    return row.unit || SOURCE_PRICE_DISPLAY_UNITS.coffee_board;
  }
  return SOURCE_PRICE_DISPLAY_UNITS[row.source_id] || null;
}

function ensureDatabaseExists() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database not found: ${DB_PATH}`);
  }
}

function buildCategoryData(db) {
  const definitions = [
    { id: "fruits", label: "Fruits" },
    { id: "vegetables", label: "Vegetables" },
    { id: "nuts_and_seeds", label: "Nuts and Seeds" },
    { id: "grains_and_pulses", label: "Grains and Pulses" },
    { id: "miscellaneous", label: "Miscellaneous" },
  ];
  const rows = db.prepare(`
    SELECT
      c.name AS commodity,
      COALESCE(cm.category, c.category) AS category
    FROM commodities c
    LEFT JOIN commodity_mapping cm ON cm.commodity_id = c.id
    ORDER BY c.name ASC
  `).all();
  const grouped = new Map();

  rows.forEach((row) => {
    if (!row.category) {
      return;
    }
    if (!grouped.has(row.category)) {
      grouped.set(row.category, []);
    }
    if (row.commodity !== "Egg") {
      grouped.get(row.category).push(row.commodity);
    }
  });

  return {
    categories: definitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      commodityCount: (grouped.get(definition.id) || []).length,
      commodities: (grouped.get(definition.id) || []).slice().sort((left, right) => left.localeCompare(right)),
    })),
  };
}

function buildMapDistricts(db) {
  const rows = db.prepare(`
    SELECT
      d.name AS district_name,
      d.slug AS district_slug,
      m.name AS market_name
    FROM districts d
    LEFT JOIN market_district_mapping mdm ON mdm.district_id = d.id
    LEFT JOIN markets m ON m.id = mdm.market_id
    ORDER BY d.name ASC, m.name ASC
  `).all();

  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.district_slug)) {
      grouped.set(row.district_slug, {
        district: row.district_name,
        districtSlug: row.district_slug,
        markets: [],
      });
    }

    if (row.market_name) {
      grouped.get(row.district_slug).markets.push({ market: row.market_name });
    }
  });

  return [...grouped.values()];
}

function rebuildDocs() {
  fs.rmSync(DOCS_DIR, { recursive: true, force: true });
  copyDirectory(PUBLIC_DIR, DOCS_DIR);
  fs.writeFileSync(path.join(DOCS_DIR, ".nojekyll"), "", "utf8");
}

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  entries.forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

main();
