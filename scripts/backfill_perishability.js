const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_PRICE_SHEET_NAME = "prices";
const ENV_PATH = path.join(__dirname, "..", ".env");
const PERISHABLE_COMMODITIES = new Set([
  "banana green",
  "beans",
  "beetroot",
  "bitter gourd",
  "brinjal",
  "capsicum",
  "carrot",
  "cauliflower",
  "cucumbar",
  "green chilly",
  "green ginger",
  "knool khol",
  "ladies finger",
  "onion",
  "potato",
  "tomato",
]);
const NON_PERISHABLE_COMMODITIES = new Set([
  "bajra",
  "maize",
  "paddy",
  "rice",
  "cotton",
  "coconut (per 1000)",
  "bengalgram",
  "black gramdal",
  "tur",
  "tur dal",
]);

function stripMatchingQuotes(value) {
  if (!value) {
    return value;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripMatchingQuotes(trimmed.slice(separatorIndex + 1).trim());
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
}

function normalizePrivateKey(value) {
  if (!value) {
    return value;
  }

  let normalized = stripMatchingQuotes(value.trim());
  normalized = normalized.replace(/\\r\\n/g, "\r\n");
  normalized = normalized.replace(/\\n/g, "\n");
  normalized = normalized.replace(/\\r/g, "\r");
  return normalized.trim();
}

function normalizeCommodityName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function classifyPerishability(commodityName) {
  const normalized = normalizeCommodityName(commodityName);
  if (PERISHABLE_COMMODITIES.has(normalized)) {
    return "perishable";
  }
  if (NON_PERISHABLE_COMMODITIES.has(normalized)) {
    return "non-perishable";
  }
  return "unknown";
}

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getGoogleAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedToken), privateKey);
  const assertion = `${unsignedToken}.${base64Url(signature)}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payloadJson = await response.json();
  if (!response.ok) {
    throw new Error(`Google token request failed: ${response.status} ${JSON.stringify(payloadJson)}`);
  }

  return payloadJson.access_token;
}

async function sheetsRequest(spreadsheetId, token, method, apiPath, body) {
  const response = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Google Sheets request failed: ${response.status} ${text}`);
  }

  return parsed;
}

async function getSheetValues(spreadsheetId, token, range) {
  const encodedRange = encodeURIComponent(range);
  const result = await sheetsRequest(spreadsheetId, token, "GET", `/values/${encodedRange}`, null);
  return result && result.values ? result.values : [];
}

async function batchUpdateValues(spreadsheetId, token, data) {
  return sheetsRequest(spreadsheetId, token, "POST", "/values:batchUpdate", {
    valueInputOption: "RAW",
    data,
  });
}

function toColumnLetter(index) {
  let value = index;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function parseArgs(argv) {
  const options = {
    sheetName: process.env.GOOGLE_PRICES_SHEET_NAME || DEFAULT_PRICE_SHEET_NAME,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--sheet") {
      options.sheetName = argv[index + 1] || options.sheetName;
      index += 1;
    } else if (arg.startsWith("--sheet=")) {
      options.sheetName = arg.slice("--sheet=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Backfill perishability in the Google Sheets prices tab.

Usage:
  node scripts/backfill_perishability.js [options]

Options:
  --sheet NAME            Override prices sheet name.
  --dry-run               Print the planned updates without writing them.
  --help, -h              Show this help.
`);
}

async function main() {
  loadDotEnvFile(ENV_PATH);
  const options = parseArgs(process.argv.slice(2));
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!email || !privateKey || !spreadsheetId) {
    throw new Error("Missing Google Sheets credentials. Expected GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SPREADSHEET_ID.");
  }

  const token = await getGoogleAccessToken(email, privateKey);
  const headerRow = await getSheetValues(spreadsheetId, token, `${options.sheetName}!1:1`);
  const headers = headerRow[0] || [];

  if (headers.length === 0) {
    throw new Error(`Sheet "${options.sheetName}" is empty.`);
  }

  const commodityIndex = headers.indexOf("commodity");
  const perishabilityIndex = headers.indexOf("perishability");

  if (commodityIndex === -1) {
    throw new Error(`Sheet "${options.sheetName}" does not contain a "commodity" column.`);
  }
  if (perishabilityIndex === -1) {
    throw new Error(`Sheet "${options.sheetName}" does not contain a "perishability" column. Run the scraper once so it adds the new header first.`);
  }

  const lastColumn = toColumnLetter(headers.length);
  const rows = await getSheetValues(spreadsheetId, token, `${options.sheetName}!A2:${lastColumn}`);
  const updates = [];

  rows.forEach((row, index) => {
    const commodityName = row[commodityIndex] || "";
    if (!commodityName) {
      return;
    }

    const desiredValue = classifyPerishability(commodityName);
    const currentValue = row[perishabilityIndex] || "";
    if (currentValue === desiredValue) {
      return;
    }

    const rowNumber = index + 2;
    const columnLetter = toColumnLetter(perishabilityIndex + 1);
    updates.push({
      range: `${options.sheetName}!${columnLetter}${rowNumber}`,
      majorDimension: "ROWS",
      values: [[desiredValue]],
    });
  });

  if (options.dryRun) {
    console.log(`Dry run: ${updates.length} rows would be updated in sheet "${options.sheetName}".`);
    console.log(updates.slice(0, 10));
    return;
  }

  if (updates.length === 0) {
    console.log(`No backfill needed in sheet "${options.sheetName}".`);
    return;
  }

  await batchUpdateValues(spreadsheetId, token, updates);
  console.log(`Updated ${updates.length} rows in sheet "${options.sheetName}".`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
