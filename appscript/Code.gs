const APP_CONFIG = {
  spreadsheetId: "",
  pricesSheetName: "prices",
  runsSheetName: "runs",
  mappingSheetName: "commodity_mapping",
  perishabilityOptions: ["perishable", "non-perishable"],
};

const PRICES_HEADER = [
  "row_key",
  "report_date",
  "heading",
  "commodity",
  "perishability",
  "Market",
  "Variety",
  "Grade",
  "Arrivals",
  "Units",
  "Min (Rs.)",
  "Max (Rs.)",
  "Modal (Rs.)",
  "scraped_at",
];

const MAPPING_HEADER = [
  "commodity",
  "perishability",
  "updated_at",
];

const DASHBOARD_TYPE_OPTIONS = [
  { value: "all", label: "All Commodities" },
  { value: "perishable", label: "Perishable" },
  { value: "non-perishable", label: "Non-Perishable" },
];

const COMMODITY_FILTER_FIELDS = [
  "commodity",
  "market",
  "variety",
  "grade",
];

const MOVERS_FILTER_FIELDS = [
  "commodity",
  "market",
  "variety",
  "grade",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("KRAMA Tools")
    .addItem("Open Commodity Mapping", "openCommodityMappingSidebar")
    .addItem("Apply Commodity Mapping", "applyCommodityMappings")
    .addSeparator()
    .addItem("Ensure Mapping Sheet", "ensureCommodityMappingSheet")
    .addToUi();
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Dashboard")
    .setTitle("KRAMA Commodity Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function openCommodityMappingSidebar() {
  ensureCommodityMappingSheet();
  const html = HtmlService.createHtmlOutputFromFile("CommodityMapping")
    .setTitle("Commodity Mapping");
  SpreadsheetApp.getUi().showSidebar(html);
}

function ensureCommodityMappingSheet() {
  const spreadsheet = getSpreadsheet_();
  ensurePricesSchema_(spreadsheet);
  const sheet = ensureSheetWithHeader_(spreadsheet, APP_CONFIG.mappingSheetName, MAPPING_HEADER);
  return {
    sheetName: sheet.getName(),
    rowCount: Math.max(sheet.getLastRow() - 1, 0),
  };
}

function getCommodityMappingManagerData() {
  const spreadsheet = getSpreadsheet_();
  ensurePricesSchema_(spreadsheet);
  ensureSheetWithHeader_(spreadsheet, APP_CONFIG.mappingSheetName, MAPPING_HEADER);

  const priceRows = getSheetRecords_(spreadsheet, APP_CONFIG.pricesSheetName);
  const mappingRows = getSheetRecords_(spreadsheet, APP_CONFIG.mappingSheetName);
  const mappingByCommodity = {};

  mappingRows.forEach(function(row) {
    const commodity = asText_(row.commodity);
    if (!commodity) {
      return;
    }
    mappingByCommodity[commodity] = asText_(row.perishability);
  });

  const uniqueCommodities = uniqueSorted_(
    priceRows.map(function(row) { return asText_(row.commodity); })
  );

  const items = uniqueCommodities.map(function(commodity) {
    return {
      commodity: commodity,
      perishability: mappingByCommodity[commodity] || "",
    };
  });

  const mappedCount = items.filter(function(item) { return !!item.perishability; }).length;

  return {
    items: items,
    options: APP_CONFIG.perishabilityOptions.slice(),
    stats: {
      totalCommodities: items.length,
      mappedCommodities: mappedCount,
      unmappedCommodities: items.length - mappedCount,
    },
  };
}

function saveCommodityMappings(payload) {
  const spreadsheet = getSpreadsheet_();
  const sheet = ensureSheetWithHeader_(spreadsheet, APP_CONFIG.mappingSheetName, MAPPING_HEADER);
  const items = normalizeMappingPayload_(payload);
  const now = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX");

  const values = items.map(function(item) {
    return [
      item.commodity,
      item.perishability,
      now,
    ];
  });

  const existingRows = Math.max(sheet.getLastRow() - 1, 0);
  if (existingRows > 0) {
    sheet.getRange(2, 1, existingRows, MAPPING_HEADER.length).clearContent();
  }

  if (values.length > 0) {
    sheet.getRange(2, 1, values.length, MAPPING_HEADER.length).setValues(values);
  }

  return {
    savedCount: values.length,
    updatedAt: now,
  };
}

function applyCommodityMappings() {
  const spreadsheet = getSpreadsheet_();
  const pricesSheet = ensurePricesSchema_(spreadsheet);
  const mappingSheet = ensureSheetWithHeader_(spreadsheet, APP_CONFIG.mappingSheetName, MAPPING_HEADER);
  const priceRows = getSheetRecords_(spreadsheet, APP_CONFIG.pricesSheetName);
  const mappingRows = getSheetRecords_(spreadsheet, APP_CONFIG.mappingSheetName);
  const mappingByCommodity = {};

  mappingRows.forEach(function(row) {
    const commodity = asText_(row.commodity);
    const perishability = asText_(row.perishability);
    if (!commodity || !perishability) {
      return;
    }
    mappingByCommodity[commodity] = perishability;
  });

  const header = pricesSheet.getRange(1, 1, 1, pricesSheet.getLastColumn()).getValues()[0];
  const commodityColumnIndex = header.indexOf("commodity");
  const perishabilityColumnIndex = header.indexOf("perishability");

  if (commodityColumnIndex === -1 || perishabilityColumnIndex === -1) {
    throw new Error("The prices sheet must contain both commodity and perishability columns.");
  }

  const updates = [];
  let updatedCount = 0;
  let unchangedCount = 0;
  let unmappedCount = 0;

  priceRows.forEach(function(row, index) {
    const commodity = asText_(row.commodity);
    const currentValue = asText_(row.perishability);
    const mappedValue = mappingByCommodity[commodity] || "";

    if (!commodity) {
      return;
    }

    if (!mappedValue) {
      unmappedCount += 1;
      return;
    }

    if (currentValue === mappedValue) {
      unchangedCount += 1;
      return;
    }

    updates.push([mappedValue]);
    updatedCount += 1;
  });

  if (updatedCount > 0) {
    const values = pricesSheet.getDataRange().getValues();
    const writeRanges = [];
    values.slice(1).forEach(function(row, index) {
      const commodity = asText_(row[commodityColumnIndex]);
      const currentValue = asText_(row[perishabilityColumnIndex]);
      const mappedValue = mappingByCommodity[commodity] || "";
      if (!commodity || !mappedValue || currentValue === mappedValue) {
        return;
      }
      writeRanges.push({
        rowNumber: index + 2,
        value: mappedValue,
      });
    });

    writeRanges.forEach(function(item) {
      pricesSheet.getRange(item.rowNumber, perishabilityColumnIndex + 1).setValue(item.value);
    });
  }

  return {
    updatedCount: updatedCount,
    unchangedCount: unchangedCount,
    unmappedCount: unmappedCount,
    mappingRowCount: Math.max(mappingSheet.getLastRow() - 1, 0),
  };
}

function getSpreadsheet_() {
  if (APP_CONFIG.spreadsheetId) {
    return SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensurePricesSchema_(spreadsheet) {
  return ensureSheetWithHeader_(spreadsheet, APP_CONFIG.pricesSheetName, PRICES_HEADER);
}

function ensureSheetWithHeader_(spreadsheet, sheetName, expectedHeader) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const lastColumn = Math.max(sheet.getLastColumn(), expectedHeader.length);
  const existingHeader = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  const mergedHeader = existingHeader.slice(0, expectedHeader.length);
  expectedHeader.forEach(function(column, index) {
    if (!mergedHeader[index]) {
      mergedHeader[index] = column;
    }
  });

  let changed = false;
  expectedHeader.forEach(function(column, index) {
    if (mergedHeader[index] !== column) {
      mergedHeader[index] = column;
      changed = true;
    }
  });

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
    return sheet;
  }

  if (changed || existingHeader.slice(0, expectedHeader.length).join("|") !== mergedHeader.join("|")) {
    sheet.getRange(1, 1, 1, mergedHeader.length).setValues([mergedHeader]);
  }

  return sheet;
}

function getSheetRecords_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const header = values[0];
  return values.slice(1).map(function(row) {
    const record = {};
    header.forEach(function(column, index) {
      record[column] = row[index];
    });
    return record;
  });
}

function normalizeMappingPayload_(payload) {
  const items = payload && payload.items ? payload.items : [];
  const seen = {};
  const normalized = [];

  items.forEach(function(item) {
    const commodity = asText_(item && item.commodity);
    const perishability = asText_(item && item.perishability);

    if (!commodity || !perishability) {
      return;
    }
    if (APP_CONFIG.perishabilityOptions.indexOf(perishability) === -1) {
      return;
    }
    if (seen[commodity]) {
      return;
    }

    seen[commodity] = true;
    normalized.push({
      commodity: commodity,
      perishability: perishability,
    });
  });

  normalized.sort(function(left, right) {
    return left.commodity.localeCompare(right.commodity);
  });

  return normalized;
}

function uniqueSorted_(values) {
  const map = {};
  values.forEach(function(value) {
    const text = asText_(value);
    if (text) {
      map[text] = true;
    }
  });
  return Object.keys(map).sort(function(left, right) {
    return left.localeCompare(right);
  });
}

function asText_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function getDashboardBootstrap() {
  const spreadsheet = getSpreadsheet_();
  ensurePricesSchema_(spreadsheet);
  const rows = getNormalizedPriceRows_(spreadsheet);
  const latestReportDate = getLatestReportDate_(rows);
  const previousReportDate = getPreviousReportDate_(rows, latestReportDate);

  return {
    latestReportDate: latestReportDate,
    previousReportDate: previousReportDate,
    typeOptions: DASHBOARD_TYPE_OPTIONS.slice(),
    summaryCards: {
      all: buildMoversPayload_({ type: "all" }, 3, rows),
      perishable: buildMoversPayload_({ type: "perishable" }, 3, rows),
      "non-perishable": buildMoversPayload_({ type: "non-perishable" }, 3, rows),
    },
  };
}

function getCommodityTableData(filters) {
  const spreadsheet = getSpreadsheet_();
  ensurePricesSchema_(spreadsheet);
  const rows = getNormalizedPriceRows_(spreadsheet);
  const effectiveFilters = normalizeCommodityFilters_(filters, rows);
  const latestRows = getLatestRowsPerMarketEntry_(rows, effectiveFilters);
  const sortedRows = latestRows.sort(compareCommodityRows_);
  const movementByRowKey = buildCommodityMovementMap_(rows);

  return {
    effectiveFilters: effectiveFilters,
    visibleDate: getLatestReportDate_(rows),
    filterOptions: buildCommodityFilterOptions_(rows, effectiveFilters),
    rows: sortedRows.map(function(row) {
      return mapCommodityRowForClient_(row, movementByRowKey[row.rowKey]);
    }),
    rowCount: sortedRows.length,
  };
}

function getMoversTableData(filters) {
  const spreadsheet = getSpreadsheet_();
  ensurePricesSchema_(spreadsheet);
  const rows = getNormalizedPriceRows_(spreadsheet);
  const effectiveFilters = normalizeMoversFilters_(filters);
  const payload = buildMoversPayload_(effectiveFilters, 10, rows);

  return {
    effectiveFilters: payload.effectiveFilters,
    latestReportDate: payload.latestReportDate,
    previousReportDate: payload.previousReportDate,
    filterOptions: payload.filterOptions,
    rows: payload.rows,
  };
}

function getCommodityHistory(request) {
  const spreadsheet = getSpreadsheet_();
  ensurePricesSchema_(spreadsheet);
  const rows = getNormalizedPriceRows_(spreadsheet);
  const commodity = asText_(request && request.commodity);
  const market = asText_(request && request.market);
  const variety = asText_(request && request.variety);
  const grade = asText_(request && request.grade);

  const historyRows = rows
    .filter(function(row) {
      return row.commodity === commodity &&
        row.market === market &&
        row.variety === variety &&
        row.grade === grade;
    })
    .sort(function(left, right) {
      return left.reportDate.localeCompare(right.reportDate);
    });

  return {
    commodity: commodity,
    market: market,
    variety: variety,
    grade: grade,
    points: historyRows.map(function(row) {
      return {
        reportDate: row.reportDate,
        minPrice: row.minPrice,
        maxPrice: row.maxPrice,
        modalPrice: row.modalPrice,
      };
    }),
  };
}

function getNormalizedPriceRows_(spreadsheet) {
  const records = getSheetRecords_(spreadsheet, APP_CONFIG.pricesSheetName);
  return records
    .map(function(record) {
      const perishability = normalizePerishabilityValue_(record.perishability);
      return {
        rowKey: asText_(record.row_key),
        reportDate: asText_(record.report_date),
        heading: asText_(record.heading),
        commodity: asText_(record.commodity),
        perishability: perishability,
        market: asText_(record.Market),
        variety: asText_(record.Variety),
        grade: asText_(record.Grade),
        arrivals: parseNumericValue_(record.Arrivals),
        units: asText_(record.Units),
        minPrice: parseNumericValue_(record["Min (Rs.)"]),
        maxPrice: parseNumericValue_(record["Max (Rs.)"]),
        modalPrice: parseNumericValue_(record["Modal (Rs.)"]),
        scrapedAt: asText_(record.scraped_at),
      };
    })
    .filter(function(row) {
      return !!row.reportDate && !!row.commodity;
    });
}

function normalizePerishabilityValue_(value) {
  const normalized = asText_(value).toLowerCase();
  if (normalized === "perishable") {
    return "perishable";
  }
  if (normalized === "non-perishable") {
    return "non-perishable";
  }
  return "";
}

function parseNumericValue_(value) {
  const text = asText_(value).replace(/,/g, "");
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return isNaN(parsed) ? null : parsed;
}

function getUniqueReportDates_(rows) {
  const seen = {};
  rows.forEach(function(row) {
    if (row.reportDate) {
      seen[row.reportDate] = true;
    }
  });
  return Object.keys(seen).sort();
}

function getLatestReportDate_(rows) {
  const dates = getUniqueReportDates_(rows);
  return dates.length ? dates[dates.length - 1] : "";
}

function getPreviousReportDate_(rows, latestReportDate) {
  const dates = getUniqueReportDates_(rows).filter(function(date) {
    return date < latestReportDate;
  });
  return dates.length ? dates[dates.length - 1] : "";
}

function normalizeCommodityFilters_(filters, rows) {
  const safeFilters = filters || {};
  const type = normalizeTypeFilter_(safeFilters.type);

  return {
    type: type,
    commodity: asText_(safeFilters.commodity),
    market: asText_(safeFilters.market),
    variety: asText_(safeFilters.variety),
    grade: asText_(safeFilters.grade),
  };
}

function normalizeMoversFilters_(filters) {
  const safeFilters = filters || {};
  return {
    type: normalizeTypeFilter_(safeFilters.type),
    commodity: asText_(safeFilters.commodity),
    market: asText_(safeFilters.market),
    variety: asText_(safeFilters.variety),
    grade: asText_(safeFilters.grade),
  };
}

function normalizeTypeFilter_(value) {
  const normalized = asText_(value).toLowerCase();
  if (normalized === "perishable" || normalized === "non-perishable") {
    return normalized;
  }
  return "all";
}

function matchesTypeFilter_(row, type) {
  if (type === "all") {
    return true;
  }
  return row.perishability === type;
}

function applyPriceFilters_(rows, filters, options) {
  const config = options || {};
  return rows.filter(function(row) {
    if (!matchesTypeFilter_(row, filters.type)) {
      return false;
    }
    if (config.includeReportDate && filters.reportDate && row.reportDate !== filters.reportDate) {
      return false;
    }
    if (filters.commodity && row.commodity !== filters.commodity) {
      return false;
    }
    if (filters.market && row.market !== filters.market) {
      return false;
    }
    if (filters.variety && row.variety !== filters.variety) {
      return false;
    }
    if (filters.grade && row.grade !== filters.grade) {
      return false;
    }
    return true;
  });
}

function buildCommodityFilterOptions_(rows, filters) {
  const baseRows = rows.filter(function(row) {
    return matchesTypeFilter_(row, filters.type);
  });
  const latestRows = getLatestRowsPerMarketEntry_(baseRows, filters);

  return {
    type: DASHBOARD_TYPE_OPTIONS.slice(),
    commodity: getScaffoldOptionsForField_(latestRows, filters, COMMODITY_FILTER_FIELDS, "commodity"),
    market: getScaffoldOptionsForField_(latestRows, filters, COMMODITY_FILTER_FIELDS, "market"),
    variety: getScaffoldOptionsForField_(latestRows, filters, COMMODITY_FILTER_FIELDS, "variety"),
    grade: getScaffoldOptionsForField_(latestRows, filters, COMMODITY_FILTER_FIELDS, "grade"),
  };
}

function getScaffoldOptionsForField_(rows, filters, orderedFields, targetField) {
  const allowedRows = rows.filter(function(row) {
    for (let index = 0; index < orderedFields.length; index += 1) {
      const field = orderedFields[index];
      if (field === targetField) {
        break;
      }

      const selectedValue = asText_(filters[field]);
      if (!selectedValue) {
        continue;
      }

      if (field === "commodity" && row.commodity !== selectedValue) {
        return false;
      }
      if (field === "market" && row.market !== selectedValue) {
        return false;
      }
      if (field === "variety" && row.variety !== selectedValue) {
        return false;
      }
      if (field === "grade" && row.grade !== selectedValue) {
        return false;
      }
    }
    return true;
  });

  const values = {};
  allowedRows.forEach(function(row) {
    const value = targetField === "commodity"
      ? row.commodity
      : targetField === "market"
        ? row.market
        : targetField === "variety"
          ? row.variety
          : row.grade;
    if (value) {
      values[value] = true;
    }
  });

  return Object.keys(values).sort(function(left, right) {
    return left.localeCompare(right);
  });
}

function compareCommodityRows_(left, right) {
  return [
    left.commodity,
    left.market,
    left.variety,
    left.grade,
  ].join("|").localeCompare([
    right.commodity,
    right.market,
    right.variety,
    right.grade,
  ].join("|"));
}

function mapCommodityRowForClient_(row, movement) {
  const safeMovement = movement || {
    minDirection: "flat",
    maxDirection: "flat",
    modalDirection: "flat",
  };
  return {
    rowKey: row.rowKey,
    marketEntryKey: createMarketEntryKey_(row),
    reportDate: row.reportDate,
    marketDate: row.reportDate,
    heading: row.heading,
    commodity: row.commodity,
    perishability: row.perishability || "unmapped",
    market: row.market,
    variety: row.variety,
    grade: row.grade,
    arrivals: row.arrivals,
    units: row.units,
    minPrice: row.minPrice,
    maxPrice: row.maxPrice,
    modalPrice: row.modalPrice,
    minDirection: safeMovement.minDirection,
    maxDirection: safeMovement.maxDirection,
    modalDirection: safeMovement.modalDirection,
    scrapedAt: row.scrapedAt,
  };
}

function createMarketEntryKey_(row) {
  return [
    row.commodity,
    row.market,
    row.variety,
    row.grade,
  ].join("|");
}

function getLatestRowsPerMarketEntry_(rows, filters) {
  const filteredRows = applyPriceFilters_(rows, filters, { includeReportDate: false });
  const grouped = {};

  filteredRows.forEach(function(row) {
    const groupKey = [
      row.commodity,
      row.market,
      row.variety,
      row.grade,
    ].join("|");

    if (!grouped[groupKey] || row.reportDate > grouped[groupKey].reportDate) {
      grouped[groupKey] = row;
    }
  });

  return Object.keys(grouped).map(function(key) {
    return grouped[key];
  });
}

function buildCommodityMovementMap_(rows) {
  const groups = {};
  const movementByRowKey = {};

  rows.forEach(function(row) {
    const groupKey = [
      row.commodity,
      row.market,
      row.variety,
      row.grade,
    ].join("|");

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(row);
  });

  Object.keys(groups).forEach(function(groupKey) {
    const groupRows = groups[groupKey].sort(function(left, right) {
      return left.reportDate.localeCompare(right.reportDate);
    });

    for (let index = 0; index < groupRows.length; index += 1) {
      const currentRow = groupRows[index];
      const previousRow = index > 0 ? groupRows[index - 1] : null;
      movementByRowKey[currentRow.rowKey] = {
        minDirection: compareNumericDirection_(currentRow.minPrice, previousRow ? previousRow.minPrice : null),
        maxDirection: compareNumericDirection_(currentRow.maxPrice, previousRow ? previousRow.maxPrice : null),
        modalDirection: compareNumericDirection_(currentRow.modalPrice, previousRow ? previousRow.modalPrice : null),
      };
    }
  });

  return movementByRowKey;
}

function compareNumericDirection_(currentValue, previousValue) {
  if (currentValue === null || previousValue === null) {
    return "flat";
  }
  if (currentValue > previousValue) {
    return "up";
  }
  if (currentValue < previousValue) {
    return "down";
  }
  return "flat";
}

function buildMoversPayload_(filters, limit, rows) {
  const effectiveFilters = normalizeMoversFilters_(filters);
  const typeRows = rows.filter(function(row) {
    return matchesTypeFilter_(row, effectiveFilters.type);
  });
  const filteredRows = applyPriceFilters_(typeRows, {
    type: effectiveFilters.type,
    commodity: effectiveFilters.commodity,
    market: effectiveFilters.market,
    variety: effectiveFilters.variety,
    grade: effectiveFilters.grade,
  }, { includeReportDate: false });

  const latestReportDate = getLatestReportDate_(filteredRows);
  const previousReportDate = getPreviousReportDate_(filteredRows, latestReportDate);
  const latestRows = filteredRows.filter(function(row) {
    return row.reportDate === latestReportDate;
  });
  const previousRows = filteredRows.filter(function(row) {
    return row.reportDate === previousReportDate;
  });
  const latestByCommodity = aggregateModalByCommodity_(latestRows);
  const previousByCommodity = aggregateModalByCommodity_(previousRows);
  const comparisonRows = [];

  Object.keys(latestByCommodity).forEach(function(commodity) {
    if (!previousByCommodity[commodity]) {
      return;
    }

    const latestEntry = latestByCommodity[commodity];
    const previousEntry = previousByCommodity[commodity];
    if (previousEntry.modalPrice === 0) {
      return;
    }

    const absoluteChange = latestEntry.modalPrice - previousEntry.modalPrice;
    const percentChange = (absoluteChange / previousEntry.modalPrice) * 100;
    comparisonRows.push({
      commodity: commodity,
      type: latestEntry.perishability || previousEntry.perishability || "unmapped",
      latestModalPrice: roundToTwo_(latestEntry.modalPrice),
      previousModalPrice: roundToTwo_(previousEntry.modalPrice),
      absoluteChange: roundToTwo_(absoluteChange),
      percentChange: roundToTwo_(percentChange),
      direction: absoluteChange >= 0 ? "gain" : "loss",
    });
  });

  const gains = comparisonRows
    .filter(function(row) { return row.absoluteChange > 0; })
    .sort(function(left, right) { return right.percentChange - left.percentChange; })
    .slice(0, limit);
  const losses = comparisonRows
    .filter(function(row) { return row.absoluteChange < 0; })
    .sort(function(left, right) { return left.percentChange - right.percentChange; })
    .slice(0, limit);

  return {
    effectiveFilters: effectiveFilters,
    latestReportDate: latestReportDate,
    previousReportDate: previousReportDate,
    gains: gains,
    losses: losses,
    rows: gains.concat(losses),
    filterOptions: buildMoversFilterOptions_(typeRows, effectiveFilters),
  };
}

function aggregateModalByCommodity_(rows) {
  const grouped = {};

  rows.forEach(function(row) {
    if (row.modalPrice === null) {
      return;
    }
    if (!grouped[row.commodity]) {
      grouped[row.commodity] = {
        totalModal: 0,
        count: 0,
        perishability: row.perishability,
      };
    }
    grouped[row.commodity].totalModal += row.modalPrice;
    grouped[row.commodity].count += 1;
  });

  const result = {};
  Object.keys(grouped).forEach(function(commodity) {
    const entry = grouped[commodity];
    if (!entry.count) {
      return;
    }
    result[commodity] = {
      modalPrice: entry.totalModal / entry.count,
      perishability: entry.perishability,
    };
  });

  return result;
}

function buildMoversFilterOptions_(rows, filters) {
  return {
    type: DASHBOARD_TYPE_OPTIONS.slice(),
    commodity: getScaffoldOptionsForField_(rows, filters, MOVERS_FILTER_FIELDS, "commodity"),
    market: getScaffoldOptionsForField_(rows, filters, MOVERS_FILTER_FIELDS, "market"),
    variety: getScaffoldOptionsForField_(rows, filters, MOVERS_FILTER_FIELDS, "variety"),
    grade: getScaffoldOptionsForField_(rows, filters, MOVERS_FILTER_FIELDS, "grade"),
  };
}

function roundToTwo_(value) {
  return Math.round(value * 100) / 100;
}
