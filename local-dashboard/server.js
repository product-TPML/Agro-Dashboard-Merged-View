const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");
const Database = require("better-sqlite3");

const PORT = Number(process.env.PORT || 3180);
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(ROOT_DIR, "data", "agro_dashboard.db");

if (!fs.existsSync(DB_PATH)) {
  throw new Error(`Database not found: ${DB_PATH}`);
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const commodityStmt = db.prepare("SELECT name FROM commodities ORDER BY name ASC");
const marketStmt = db.prepare("SELECT name FROM markets ORDER BY name ASC");
const varietyStmt = db.prepare(`
  SELECT DISTINCT commodity, variety
  FROM price_observations_flat
  ORDER BY variety ASC, commodity ASC
`);
const mapDistrictsStmt = db.prepare(`
  SELECT
    d.name AS district_name,
    d.slug AS district_slug,
    m.name AS market_name
  FROM districts d
  LEFT JOIN market_district_mapping mdm ON mdm.district_id = d.id
  LEFT JOIN markets m ON m.id = mdm.market_id
  ORDER BY d.name ASC, m.name ASC
`);

const contextStatements = {
  commodity: db.prepare(`
    SELECT
      row_key,
      report_date,
      commodity,
      perishability,
      market,
      variety,
      grade,
      arrivals,
      unit,
      min_price,
      max_price,
      modal_price
    FROM price_observations_flat
    WHERE commodity = ?
    ORDER BY market ASC, variety ASC, grade ASC, report_date DESC
  `),
  market: db.prepare(`
    SELECT
      row_key,
      report_date,
      commodity,
      perishability,
      market,
      variety,
      grade,
      arrivals,
      unit,
      min_price,
      max_price,
      modal_price
    FROM price_observations_flat
    WHERE market = ?
    ORDER BY commodity ASC, variety ASC, grade ASC, report_date DESC
  `),
  variety: db.prepare(`
    SELECT
      row_key,
      report_date,
      commodity,
      perishability,
      market,
      variety,
      grade,
      arrivals,
      unit,
      min_price,
      max_price,
      modal_price
    FROM price_observations_flat
    WHERE commodity = ? AND variety = ?
    ORDER BY market ASC, grade ASC, report_date DESC
  `),
};

const searchIndex = {
  commodities: commodityStmt.all().map((row) => row.name),
  markets: marketStmt.all().map((row) => row.name),
  varieties: varietyStmt.all().map((row) => ({
    commodity: row.commodity,
    variety: row.variety,
  })),
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/api/search") {
    return handleSearch(requestUrl, res);
  }

  if (requestUrl.pathname === "/api/search-index") {
    return handleSearchIndex(res);
  }

  if (requestUrl.pathname === "/api/context") {
    return handleContext(requestUrl, res);
  }

  if (requestUrl.pathname === "/api/map") {
    return handleMap(res);
  }

  if (requestUrl.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      dbPath: DB_PATH,
    });
  }

  return serveStatic(requestUrl.pathname, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Local dashboard running at http://127.0.0.1:${PORT}`);
});

function handleSearch(requestUrl, res) {
  const query = (requestUrl.searchParams.get("q") || "").trim();
  if (!query) {
    return sendJson(res, 200, { query, results: [] });
  }

  const normalized = query.toLowerCase();
  const commodityResults = searchIndex.commodities
    .map((name) => ({
      type: "commodity",
      sortKey: getMatchSortKey(name, normalized),
      label: `${name} (Commodity)`,
      commodity: name,
    }))
    .filter((item) => item.sortKey)
    .sort(compareSearchResults)
    .slice(0, 6);

  const marketResults = searchIndex.markets
    .map((name) => ({
      type: "market",
      sortKey: getMatchSortKey(name, normalized),
      label: `${name} (Market)`,
      market: name,
    }))
    .filter((item) => item.sortKey)
    .sort(compareSearchResults)
    .slice(0, 6);

  const varietyResults = searchIndex.varieties
    .map((item) => {
      const label = `${item.variety} (${item.commodity})`;
      return {
        type: "variety",
        sortKey: getMatchSortKey(item.variety, normalized),
        label,
        commodity: item.commodity,
        variety: item.variety,
      };
    })
    .filter((item) => item.sortKey)
    .sort(compareSearchResults)
    .slice(0, 8);

  return sendJson(res, 200, {
    query,
    results: [...commodityResults, ...marketResults, ...varietyResults].slice(0, 12),
  });
}

function handleContext(requestUrl, res) {
  const type = requestUrl.searchParams.get("type");
  if (!contextStatements[type]) {
    return sendJson(res, 400, { error: "Invalid context type." });
  }

  let context;
  let rows;

  if (type === "commodity") {
    const commodity = (requestUrl.searchParams.get("commodity") || "").trim();
    if (!commodity) {
      return sendJson(res, 400, { error: "Missing commodity." });
    }
    rows = contextStatements.commodity.all(commodity);
    context = {
      type,
      heading: commodity,
      locked: { commodity },
      filters: ["market", "variety"],
      resultLabel: `${commodity} (Commodity)`,
    };
  } else if (type === "market") {
    const market = (requestUrl.searchParams.get("market") || "").trim();
    if (!market) {
      return sendJson(res, 400, { error: "Missing market." });
    }
    rows = contextStatements.market.all(market);
    context = {
      type,
      heading: market,
      locked: { market },
      filters: ["commodity", "variety"],
      resultLabel: `${market} (Market)`,
    };
  } else {
    const commodity = (requestUrl.searchParams.get("commodity") || "").trim();
    const variety = (requestUrl.searchParams.get("variety") || "").trim();
    if (!commodity || !variety) {
      return sendJson(res, 400, { error: "Missing commodity or variety." });
    }
    rows = contextStatements.variety.all(commodity, variety);
    context = {
      type,
      heading: `${commodity} / ${variety}`,
      locked: { commodity, variety },
      filters: ["market"],
      resultLabel: `${variety} (${commodity})`,
    };
  }

  return sendJson(res, 200, {
    context,
    rows: rows.map((row) => ({
      rowKey: row.row_key,
      reportDate: row.report_date,
      commodity: row.commodity,
      perishability: row.perishability,
      market: row.market,
      variety: row.variety,
      grade: row.grade,
      arrivals: row.arrivals,
      unit: row.unit,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      modalPrice: row.modal_price,
    })),
  });
}

function handleSearchIndex(res) {
  return sendJson(res, 200, {
    commodities: searchIndex.commodities,
    markets: searchIndex.markets,
    varieties: searchIndex.varieties,
  });
}

function handleMap(res) {
  const grouped = new Map();
  const rows = mapDistrictsStmt.all();

  rows.forEach((row) => {
    if (!grouped.has(row.district_slug)) {
      grouped.set(row.district_slug, {
        district: row.district_name,
        districtSlug: row.district_slug,
        markets: [],
      });
    }

    if (row.market_name) {
      grouped.get(row.district_slug).markets.push({
        market: row.market_name,
      });
    }
  });

  return sendJson(res, 200, {
    districts: [...grouped.values()],
  });
}

function getMatchSortKey(source, query) {
  const haystack = source.toLowerCase();
  const index = haystack.indexOf(query);
  if (index === -1) {
    return null;
  }
  return {
    index,
    length: source.length,
    value: source,
  };
}

function compareSearchResults(left, right) {
  if (left.sortKey.index !== right.sortKey.index) {
    return left.sortKey.index - right.sortKey.index;
  }
  if (left.sortKey.length !== right.sortKey.length) {
    return left.sortKey.length - right.sortKey.length;
  }
  return left.sortKey.value.localeCompare(right.sortKey.value);
}

function serveStatic(requestPath, res) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, "Forbidden");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendFile(path.join(PUBLIC_DIR, "index.html"), res);
  }

  return sendFile(filePath, res);
}

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { "Content-Type": mimeType });
  stream.pipe(res);
  stream.on("error", (error) => {
    sendText(res, 500, error.message);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(payload);
}
