(function() {
  const app = document.getElementById("app");
  const LOCALE_STORAGE_KEY = "commodity-dashboard-locale";

  const state = {
    route: parseRoute(),
    query: "",
    suggestions: [],
    context: null,
    baseRows: [],
    filters: {},
    openFilter: null,
    activeChartDate: null,
    expandedRowKey: null,
    searchToken: 0,
    locale: getStoredLocale(),
    translations: {
      commodities: {},
      markets: {},
      varieties: {},
    },
    searchIndex: {
      commodities: [],
      markets: [],
      varieties: [],
    },
    mapSvgMarkup: "",
    mapDistricts: [],
    mapBaseViewBox: null,
    mapViewBox: null,
    activeMapDistrictSlug: "",
  };

  const MAP_DISTRICT_COLORS = [
    "#d85f52",
    "#e59f3a",
    "#d9c24f",
    "#90b654",
    "#4fa06e",
    "#4f8fb6",
    "#6d79c7",
    "#9a69c4",
    "#c05b9a",
    "#d47d64",
  ];

  const mapGesture = {
    pointerId: null,
    isPanning: false,
    panStartClient: null,
    panStartViewBox: null,
    touchMode: null,
    pinchStartDistance: 0,
    pinchStartViewBox: null,
    pinchAnchorSvg: null,
    didMove: false,
    suppressClickUntil: 0,
  };

  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("popstate", handlePopState);

  boot();

  async function boot() {
    loadTranslations();
    loadSearchIndex();
    loadMapSvg();
    loadMapData();
    render();
    if (state.route.view === "table") {
      await loadContext();
    }
  }

  async function loadMapSvg() {
    try {
      const response = await fetch("/karnataka-geo.svg");
      if (!response.ok) {
        throw new Error(`Map request failed: ${response.status}`);
      }

      const svgText = await response.text();
      state.mapSvgMarkup = svgText;
    } catch (error) {
      state.mapSvgMarkup = "";
    }

    render();
  }

  async function loadMapData() {
    try {
      const payload = await fetchJson("/api/map");
      state.mapDistricts = payload.districts || [];
    } catch (error) {
      state.mapDistricts = [];
    }

    render();
  }

  async function loadTranslations() {
    try {
      const payload = await fetchJson("/translations.json");
      state.translations = {
        commodities: payload.commodities || {},
        markets: payload.markets || {},
        varieties: payload.varieties || {},
      };
    } catch (error) {
      state.translations = {
        commodities: {},
        markets: {},
        varieties: {},
      };
    }

    render();
  }

  async function loadSearchIndex() {
    try {
      const payload = await fetchJson("/api/search-index");
      state.searchIndex = {
        commodities: payload.commodities || [],
        markets: payload.markets || [],
        varieties: payload.varieties || [],
      };
    } catch (error) {
      state.searchIndex = {
        commodities: [],
        markets: [],
        varieties: [],
      };
    }

    if (state.query.trim() && hasClientSearchIndex()) {
      state.suggestions = buildLocalizedSearchResults(state.query.trim());
      render();
    }
  }

  function parseRoute() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") === "table" ? "table" : "home";
    return {
      view,
      type: params.get("type") || "",
      commodity: params.get("commodity") || "",
      market: params.get("market") || "",
      variety: params.get("variety") || "",
    };
  }

  function buildRouteUrl(route) {
    const params = new URLSearchParams();
    if (route.view === "table") {
      params.set("view", "table");
      params.set("type", route.type);
      if (route.commodity) {
        params.set("commodity", route.commodity);
      }
      if (route.market) {
        params.set("market", route.market);
      }
      if (route.variety) {
        params.set("variety", route.variety);
      }
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }

  function navigate(route) {
    const nextUrl = buildRouteUrl(route);
    window.history.pushState({}, "", nextUrl);
    state.route = route;
    state.context = null;
    state.baseRows = [];
    state.filters = {};
    state.openFilter = null;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    state.suggestions = [];
    render();
    if (route.view === "table") {
      loadContext();
    }
  }

  function handlePopState() {
    state.route = parseRoute();
    state.context = null;
    state.baseRows = [];
    state.filters = {};
    state.openFilter = null;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    state.suggestions = [];
    render();
    if (state.route.view === "table") {
      loadContext();
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  async function search(query) {
    const token = ++state.searchToken;
    if (!query.trim()) {
      state.suggestions = [];
      render();
      return;
    }

    if (hasClientSearchIndex()) {
      if (token !== state.searchToken) {
        return;
      }
      state.suggestions = buildLocalizedSearchResults(query.trim());
      render();
      return;
    }

    const payload = await fetchJson(`/api/search?q=${encodeURIComponent(query.trim())}`);
    if (token !== state.searchToken) {
      return;
    }

    state.suggestions = payload.results;
    render();
  }

  async function loadContext() {
    const route = state.route;
    const params = new URLSearchParams({ type: route.type });
    if (route.commodity) {
      params.set("commodity", route.commodity);
    }
    if (route.market) {
      params.set("market", route.market);
    }
    if (route.variety) {
      params.set("variety", route.variety);
    }

    try {
      const payload = await fetchJson(`/api/context?${params.toString()}`);
      state.context = payload.context;
      state.baseRows = payload.rows;
      state.filters = buildInitialFilters(payload.context.filters);
      state.openFilter = null;
      state.activeChartDate = null;
      state.expandedRowKey = null;
    } catch (error) {
      state.context = {
        heading: "Unavailable",
        locked: {},
        filters: [],
      };
      state.baseRows = [];
      state.filters = {};
      state.openFilter = null;
      state.activeChartDate = null;
    }
    render();
  }

  function buildInitialFilters(filterNames) {
    const next = {};
    filterNames.forEach((name) => {
      next[name] = "";
    });
    return next;
  }

  function handleDocumentClick(event) {
    if (!event.target.closest("[data-search-root]")) {
      if (state.suggestions.length) {
        state.suggestions = [];
        render();
        return;
      }
    }

    if (!event.target.closest("[data-filter-root]")) {
      if (state.openFilter) {
        state.openFilter = null;
        render();
      }
    }
  }

  function handleSearchInput(event) {
    state.query = event.target.value;
    search(state.query);
  }

  function handleSuggestionSelect(result) {
    const route = {
      view: "table",
      type: result.type,
      commodity: result.commodity || "",
      market: result.market || "",
      variety: result.variety || "",
    };
    state.query = "";
    navigate(route);
  }

  function handleHomeClick() {
    state.query = "";
    navigate({
      view: "home",
      type: "",
      commodity: "",
      market: "",
      variety: "",
    });
  }

  function handleMapMarketSelect(market) {
    navigate({
      view: "table",
      type: "market",
      commodity: "",
      market,
      variety: "",
    });
  }

  function zoomMap(direction) {
    const currentViewBox = getCurrentMapViewBox();
    if (!currentViewBox) {
      return;
    }

    const scale = direction > 0 ? 0.82 : 1.18;
    state.mapViewBox = scaleMapViewBox(currentViewBox, scale);
    render();
  }

  function resetMapViewport() {
    state.mapViewBox = state.mapBaseViewBox ? [...state.mapBaseViewBox] : null;
    state.activeMapDistrictSlug = "";
  }

  function focusMapRegion(bounds, districtSlug) {
    if (!bounds) {
      return;
    }

    const padding = 0.22;
    const width = Math.max(24, bounds.width * (1 + padding * 2));
    const height = Math.max(24, bounds.height * (1 + padding * 2));
    const nextViewBox = [
      bounds.x - (bounds.width * padding),
      bounds.y - (bounds.height * padding),
      width,
      height,
    ];

    state.mapViewBox = constrainMapViewBox(nextViewBox);
    state.activeMapDistrictSlug = districtSlug || "";
    render();
  }

  function handleFilterChange(name, value) {
    state.filters[name] = value;
    state.openFilter = null;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    render();
  }

  function handleClearFilters() {
    Object.keys(state.filters).forEach((name) => {
      state.filters[name] = "";
    });
    state.openFilter = null;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    render();
  }

  function toggleFilterMenu(name) {
    state.openFilter = state.openFilter === name ? null : name;
    render();
  }

  function setActiveChartDate(date) {
    state.activeChartDate = date;
    render();
  }

  function getRowsForCurrentView() {
    const filteredRows = state.baseRows.filter((row) => {
      return Object.entries(state.filters).every(([key, value]) => {
        return !value || row[key] === value;
      });
    });

    const latestRows = new Map();

    filteredRows.forEach((row) => {
      const groupKey = buildLatestRowGroupKey(row);
      const existing = latestRows.get(groupKey);
      if (!existing || row.reportDate > existing.reportDate) {
        latestRows.set(groupKey, row);
      }
    });

    return [...latestRows.values()].sort((left, right) => {
      const marketCompare = left.market.localeCompare(right.market);
      if (marketCompare !== 0) {
        return marketCompare;
      }

      const commodityCompare = left.commodity.localeCompare(right.commodity);
      if (commodityCompare !== 0) {
        return commodityCompare;
      }

      const varietyCompare = left.variety.localeCompare(right.variety);
      if (varietyCompare !== 0) {
        return varietyCompare;
      }

      return left.grade.localeCompare(right.grade);
    });
  }

  function buildLatestRowGroupKey(row) {
    return [
      row.commodity,
      row.market,
      row.variety,
      row.grade,
    ].join("|");
  }

  function getFilterOptions(field) {
    const rows = state.baseRows.filter((row) => {
      return Object.entries(state.filters).every(([key, value]) => {
        if (key === field) {
          return true;
        }
        return !value || row[key] === value;
      });
    });
    return [...new Set(rows.map((row) => row[field]))].sort((left, right) => left.localeCompare(right));
  }

  function getHistoryRows(selectedRow) {
    const windowDays = selectedRow.perishability === "perishable" ? 7 : 30;
    const endDate = new Date(`${selectedRow.reportDate}T00:00:00`);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (windowDays - 1));

    return state.baseRows
      .filter((row) => {
        if (row.commodity !== selectedRow.commodity) return false;
        if (row.market !== selectedRow.market) return false;
        if (row.variety !== selectedRow.variety) return false;
        if (row.grade !== selectedRow.grade) return false;
        const currentDate = new Date(`${row.reportDate}T00:00:00`);
        return currentDate >= startDate && currentDate <= endDate;
      })
      .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
  }

  function formatHeading() {
    if (!state.context) {
      return "";
    }
    if (state.context.type === "commodity") {
      return translateEntity("commodity", state.context.locked.commodity);
    }
    if (state.context.type === "market") {
      return translateEntity("market", state.context.locked.market);
    }
    if (state.context.type === "variety") {
      return `${translateEntity("commodity", state.context.locked.commodity)} / ${translateEntity("variety", state.context.locked.variety)}`;
    }
    return state.context.heading;
  }

  function formatLockedHeadings() {
    if (!state.context) {
      return "";
    }
    return Object.entries(state.context.locked)
      .map(([key, value]) => `<span>${capitalize(key)}: ${escapeHtml(translateEntity(key, value))}</span>`)
      .join("");
  }

  function render() {
    const searchInputState = captureSearchInputState();
    const scrollState = captureScrollState();
    const rows = getRowsForCurrentView();

    app.innerHTML = `
      <div class="shell">
        <div class="shell-top">
          ${renderLocaleToggle()}
        </div>
        <main>
          <section class="view ${state.route.view === "home" ? "active" : ""}" id="homeView">
            <div class="home-stack">
              <section class="panel welcome-card">
                <div class="welcome-copy">
                  <p class="search-label">Home</p>
                  <h2>Home</h2>
                  <p>Use the search bar to start with a commodity, market, or variety. After opening the table, refine the results using the available filters.</p>
                  <p>Click any row to view recent price movement.</p>
                </div>
              </section>

              ${renderSearchPanel()}

              <aside class="panel map-card">
                <div>
                  <p class="search-label">Market Map</p>
                  <h3>Browse by district and market</h3>
                  <p class="muted">Search remains available, but you can also click a district, zoom in, and open a market table directly from the map.</p>
                </div>
                ${renderMapPanel()}
              </aside>
            </div>
          </section>

          <section class="view ${state.route.view === "table" ? "active" : ""}" id="tableView">
            <div class="table-stack">
              ${renderSearchPanel()}

            <section class="panel table-card">
              <div class="table-head">
                <div>
                  <p class="search-label">Table View</p>
                  <h2>${escapeHtml(formatHeading()) || "Loading..."}</h2>
                  <div class="locked-headings">${formatLockedHeadings()}</div>
                  <p>Use the filters to narrow the list. Click any row to view the recent price trend for that exact commodity entry.</p>
                </div>
                <button type="button" class="back-button" id="backHome">Home</button>
              </div>

              ${renderFilters()}

              <div class="table-wrap" data-preserve-scroll-id="table-wrap">
                ${renderTable(rows)}
              </div>
            </section>
            </div>
          </section>
        </main>
      </div>
    `;

    bindEvents();
    restoreSearchInputState(searchInputState);
    restoreScrollState(scrollState);
  }

  function captureSearchInputState() {
    const input = document.activeElement;
    if (!input || !input.matches("[data-global-search]")) {
      return null;
    }

    return {
      hadFocus: document.activeElement === input,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    };
  }

  function restoreSearchInputState(snapshot) {
    if (!snapshot || !snapshot.hadFocus) {
      return;
    }

    const input = document.querySelector(".view.active [data-global-search]");
    if (!input) {
      return;
    }

    input.focus();
    if (typeof snapshot.selectionStart === "number" && typeof snapshot.selectionEnd === "number") {
      input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  }

  function captureScrollState() {
    const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
    return {
      windowX: window.scrollX,
      windowY: window.scrollY,
      tableWrap: tableWrap ? {
        scrollLeft: tableWrap.scrollLeft,
        scrollTop: tableWrap.scrollTop,
      } : null,
    };
  }

  function restoreScrollState(snapshot) {
    if (!snapshot) {
      return;
    }

    window.scrollTo(snapshot.windowX, snapshot.windowY);

    if (!snapshot.tableWrap) {
      return;
    }

    const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
    if (!tableWrap) {
      return;
    }

    tableWrap.scrollLeft = snapshot.tableWrap.scrollLeft;
    tableWrap.scrollTop = snapshot.tableWrap.scrollTop;
  }

  function renderSearchPanel() {
    return `
      <section class="panel search-panel" data-search-root>
        <label class="search-label">Search commodities, markets, or varieties</label>
        <div class="search-box">
          <span>⌕</span>
          <input
            type="text"
            autocomplete="off"
            placeholder="Try Tomato, Mysuru, or Local"
            value="${escapeAttribute(state.query)}"
            data-global-search="true"
          >
        </div>
        <p class="search-hint">Examples: Tomato, Mysuru, or Local.</p>
        ${state.suggestions.length ? renderSuggestions() : ""}
      </section>
    `;
  }

  function renderLocaleToggle() {
    return `
      <div class="locale-toggle" role="group" aria-label="Language">
        <button type="button" class="locale-toggle-button ${state.locale === "en" ? "is-active" : ""}" data-locale-toggle="en">English</button>
        <button type="button" class="locale-toggle-button ${state.locale === "kn" ? "is-active" : ""}" data-locale-toggle="kn">Kannada</button>
      </div>
    `;
  }

  function renderMapPanel() {
    return `
      <div class="map-widget">
        <div class="map-controls">
          <button type="button" class="map-control-button" data-map-zoom="in" aria-label="Zoom in">+</button>
          <button type="button" class="map-control-button" data-map-zoom="out" aria-label="Zoom out">-</button>
          <button type="button" class="map-control-button map-control-reset" data-map-reset="true">Reset</button>
        </div>
        <div class="map-placeholder map-viewer" data-map-viewport="true">
          <div class="map-canvas" data-map-canvas="true">
            ${state.mapSvgMarkup || `<p>Loading Karnataka district map...</p>`}
          </div>
        </div>
        <p class="map-note">Click a district to zoom in and reveal its mapped market pins. Click any market pin to open that market's table.</p>
        ${renderActiveDistrictPanel()}
      </div>
    `;
  }

  function renderActiveDistrictPanel() {
    const district = getActiveMapDistrict();
    if (!district) {
      return `
        <div class="map-district-panel">
          <strong>Select a district</strong>
          <p>Click a district to zoom in. Its markets will appear as labeled pins inside the map, with this panel acting as a quick list.</p>
        </div>
      `;
    }

    const marketButtons = district.markets.length
      ? district.markets.map((entry) => `
          <button type="button" class="market-chip" data-map-market="${escapeAttribute(entry.market)}">${escapeHtml(translateEntity("market", entry.market))}</button>
        `).join("")
      : `<p class="muted">No mapped markets are available for this district in the current dataset.</p>`;

    return `
      <div class="map-district-panel">
        <strong>${escapeHtml(district.district)}</strong>
        <p>${district.markets.length} market${district.markets.length === 1 ? "" : "s"} mapped to this district.</p>
        <div class="market-chip-list">
          ${marketButtons}
        </div>
      </div>
    `;
  }

  function renderSuggestions() {
    return `
      <div class="suggestions">
        ${state.suggestions.map((result, index) => {
          return `
            <button type="button" data-suggestion-index="${index}">
              <span>${highlightMatch(getSuggestionLabel(result), state.query)}</span>
              <small>${getSuggestionMeta(result)}</small>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function getSuggestionLabel(result) {
    if (result.type === "commodity") {
      return `${translateEntity("commodity", result.commodity)} (Commodity)`;
    }
    if (result.type === "market") {
      return `${translateEntity("market", result.market)} (Market)`;
    }
    return `${translateEntity("variety", result.variety)} (${translateEntity("commodity", result.commodity)})`;
  }

  function getSuggestionMeta(result) {
    if (result.type === "commodity") {
      return "Opens the commodity table";
    }
    if (result.type === "market") {
      return "Opens the market table";
    }
    return "Opens the variety table";
  }

  function renderFilters() {
    if (!state.context) {
      return `<p class="muted">Loading table context...</p>`;
    }

    const filterMarkup = state.context.filters.map((field) => {
      const options = getFilterOptions(field);
      return `
        <div class="filter-group" data-filter-root>
          <label>${capitalize(field)} filter</label>
          <button
            type="button"
            class="filter-trigger"
            data-filter-toggle="${field}"
            aria-expanded="${state.openFilter === field ? "true" : "false"}"
          >
            <span>${escapeHtml(state.filters[field] ? translateEntity(field, state.filters[field]) : getAllLabel(field))}</span>
            <span class="filter-caret">${state.openFilter === field ? "˄" : "˅"}</span>
          </button>
          <div class="filter-menu ${state.openFilter === field ? "is-open" : ""}">
            <button
              type="button"
              class="filter-option ${state.filters[field] === "" ? "is-selected" : ""}"
              data-filter-option="${field}"
              data-filter-value=""
            >
              ${escapeHtml(getAllLabel(field))}
            </button>
            ${options.map((value) => `
              <button
                type="button"
                class="filter-option ${state.filters[field] === value ? "is-selected" : ""}"
                data-filter-option="${field}"
                data-filter-value="${escapeAttribute(value)}"
              >
                ${escapeHtml(translateEntity(field, value))}
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="filters">
        ${filterMarkup}
        <button type="button" class="clear-button" id="clearFilters">Clear Filters</button>
      </div>
    `;
  }

  function renderTable(rows) {
    if (!state.context) {
      return `<div class="empty-state">Loading rows...</div>`;
    }

    if (!rows.length) {
      return `<div class="empty-state">No rows match the current combination. The filter options stay constrained to valid combinations only, so clearing filters should broaden the result set.</div>`;
    }

    const columns = getVisibleColumns();

    return `
      <table>
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => renderTableRow(row, columns)).join("")}
        </tbody>
      </table>
    `;
  }

  function getVisibleColumns() {
    const columns = [
      { key: "commodity", label: "Commodity" },
      { key: "market", label: "Market" },
      { key: "variety", label: "Variety" },
      { key: "grade", label: "Grade" },
      { key: "arrivalsUnit", label: "Arrivals And Units" },
      { key: "maxPrice", label: "Max Price (Rs.)" },
      { key: "minPrice", label: "Min Price (Rs.)" },
      { key: "modalPrice", label: "Modal Price (Rs.)" },
      { key: "latestPriceUpdateAt", label: "Latest Price Update At" },
      { key: "previousPriceUpdateAt", label: "Previous Price Update At" },
    ];

    if (!state.context) {
      return columns;
    }

    const hidden = new Set(Object.keys(state.context.locked));
    return columns.filter((column) => !hidden.has(column.key));
  }

  function renderTableRow(row, columns) {
    const isExpanded = row.rowKey === state.expandedRowKey;
    const historyRows = isExpanded ? getHistoryRows(row) : [];
    return `
      <tr data-row-key="${escapeAttribute(row.rowKey)}" data-clickable="true">
        ${columns.map((column) => renderCell(row, column)).join("")}
      </tr>
      ${isExpanded ? `
        <tr>
          <td colspan="${columns.length}">
            ${renderHistory(row, historyRows)}
          </td>
        </tr>
      ` : ""}
    `;
  }

  function renderCell(row, column) {
    const value = row[column.key];
    const previousRow = needsPreviousRow(column.key) ? getPreviousComparableRow(row) : null;

    if (column.key === "arrivalsUnit") {
      return `<td>${escapeHtml(`${formatNumber(row.arrivals)} ${row.unit}`)}</td>`;
    }
    if (column.key === "arrivals") {
      return `<td class="price-cell">${formatNumber(value)}</td>`;
    }
    if (column.key.endsWith("Price")) {
      const delta = getPreviousPriceDelta(row, column.key, previousRow);
      return `
        <td class="price-cell">
          <div class="price-stack">
            <span class="price-value">${formatCurrency(value)}</span>
            ${renderPriceDelta(delta)}
          </div>
        </td>
      `;
    }
    if (column.key === "latestPriceUpdateAt") {
      return `<td>${escapeHtml(formatDateFull(row.reportDate))}</td>`;
    }
    if (column.key === "previousPriceUpdateAt") {
      return `<td>${escapeHtml(previousRow ? formatDateFull(previousRow.reportDate) : "-")}</td>`;
    }
    if (column.key === "commodity" || column.key === "market" || column.key === "variety") {
      return `<td>${escapeHtml(translateEntity(column.key, String(value)))}</td>`;
    }
    return `<td>${escapeHtml(String(value))}</td>`;
  }

  function needsPreviousRow(columnKey) {
    return columnKey.endsWith("Price") || columnKey === "previousPriceUpdateAt";
  }

  function getPreviousComparableRow(row) {
    return state.baseRows
      .filter((candidate) => {
        if (candidate.commodity !== row.commodity) return false;
        if (candidate.market !== row.market) return false;
        if (candidate.variety !== row.variety) return false;
        if (candidate.grade !== row.grade) return false;
        return candidate.reportDate < row.reportDate;
      })
      .sort((left, right) => right.reportDate.localeCompare(left.reportDate))[0] || null;
  }

  function getPreviousPriceDelta(row, priceKey, previousRow) {
    const comparableRow = previousRow || getPreviousComparableRow(row);

    if (!comparableRow) {
      return null;
    }

    return Number(row[priceKey]) - Number(comparableRow[priceKey]);
  }

  function renderPriceDelta(delta) {
    if (delta === null) {
      return `<span class="price-delta price-delta-flat">No earlier update</span>`;
    }

    if (delta === 0) {
      return `
        <span class="price-delta price-delta-flat">
          <span class="delta-flat">-</span>
          <span>(0)</span>
        </span>
      `;
    }

    const isGain = delta > 0;
    return `
      <span class="price-delta ${isGain ? "price-delta-gain" : "price-delta-loss"}">
        ${renderDeltaIcon(isGain)}
        <span>(${isGain ? "+" : "-"}${formatCurrency(Math.abs(delta))})</span>
      </span>
    `;
  }

  function renderDeltaIcon(isGain) {
    if (isGain) {
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true" class="delta-icon">
          <polyline points="2,11 6,8 9,9 14,4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
          <polyline points="10,4 14,4 14,8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 16 16" aria-hidden="true" class="delta-icon">
        <polyline points="2,5 6,8 9,7 14,12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
        <polyline points="10,12 14,12 14,8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>
    `;
  }

  function renderHistory(row, historyRows) {
    const windowLabel = row.perishability === "perishable" ? "Last 7 days" : "Last 30 days";
    const activePoint = getActiveHistoryPoint(historyRows);
    return `
      <section class="history-card">
        <div class="history-top">
          <div>
            <p class="search-label">Price History</p>
            <h3>${escapeHtml(`${translateEntity("commodity", row.commodity)} / ${translateEntity("market", row.market)} / ${translateEntity("variety", row.variety)} / ${row.grade}`)}</h3>
            <p>Showing the recent trend ending on ${escapeHtml(formatDateFull(row.reportDate))}.</p>
          </div>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <span class="window-chip">${windowLabel}</span>
            <button type="button" class="inline-button" data-close-history="${escapeAttribute(row.rowKey)}">Close</button>
          </div>
        </div>
        <div class="chart-shell">
          <div class="chart-legend">
            <span class="legend-key legend-max"><span></span>Max price</span>
            <span class="legend-key legend-min"><span></span>Min price</span>
            <span class="legend-key legend-modal"><span></span>Modal price</span>
          </div>
          <div class="history-grid">
            ${renderChart(historyRows, activePoint)}
            ${renderChartSummary(activePoint)}
            <div class="axis-note">Trend is shown for this exact commodity, market, variety, and grade combination.</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderChart(rows, activePoint) {
    if (!rows.length) {
      return `<p class="muted">No historical points are available inside the required time window.</p>`;
    }

    if (rows.length === 1) {
      const point = rows[0];
      return `
        <div class="footer-note">
          Only one price point is available on ${escapeHtml(formatDateFull(point.reportDate))}.
          Min: ${formatCurrency(point.minPrice)},
          Max: ${formatCurrency(point.maxPrice)},
          Modal: ${formatCurrency(point.modalPrice)}.
        </div>
      `;
    }

    const width = 940;
    const height = 280;
    const paddingX = 54;
    const paddingY = 24;
    const values = rows.flatMap((row) => [row.minPrice, row.maxPrice, row.modalPrice]);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;
    const xStep = (width - paddingX * 2) / Math.max(rows.length - 1, 1);

    const toX = (index) => paddingX + xStep * index;
    const toY = (value) => {
      const normalized = (value - minValue) / valueRange;
      return height - paddingY - normalized * (height - paddingY * 2);
    };

    const minPath = buildLinePath(rows.map((row, index) => [toX(index), toY(row.minPrice)]));
    const maxPath = buildLinePath(rows.map((row, index) => [toX(index), toY(row.maxPrice)]));
    const modalPath = buildLinePath(rows.map((row, index) => [toX(index), toY(row.modalPrice)]));
    const activeIndex = rows.findIndex((row) => row.reportDate === activePoint.reportDate);
    const activeX = toX(activeIndex);
    const activeTopY = Math.min(toY(activePoint.maxPrice), toY(activePoint.minPrice), toY(activePoint.modalPrice));

    const tooltipWidth = 176;
    const tooltipHeight = 84;
    const tooltipX = activeX > width * 0.6 ? activeX - tooltipWidth - 18 : activeX + 18;
    const tooltipY = Math.max(paddingY, Math.min(activeTopY - tooltipHeight - 14, height - paddingY - tooltipHeight));
    const tooltipAnchorX = tooltipX < activeX ? tooltipX + tooltipWidth : tooltipX;
    const tooltipAnchorY = tooltipY + 34;

    const labels = rows.map((row, index) => `
      <text x="${toX(index)}" y="${height - 4}" text-anchor="middle" fill="#5b6654" font-size="12">${escapeHtml(formatDateShort(row.reportDate))}</text>
    `).join("");

    const tooltip = `
      <g class="chart-tooltip" aria-hidden="true">
        <line x1="${tooltipAnchorX}" y1="${tooltipAnchorY}" x2="${activeX}" y2="${activeTopY}" stroke="#d8b2ab" stroke-width="1.5" stroke-dasharray="4 4" />
        <rect x="${tooltipX}" y="${tooltipY}" width="${tooltipWidth}" height="${tooltipHeight}" rx="16" fill="#fffaf6" stroke="#e0c1b7" />
        <text x="${tooltipX + 14}" y="${tooltipY + 20}" fill="#6b4a46" font-size="12" font-weight="700">${escapeHtml(formatDateFull(activePoint.reportDate))}</text>
        <circle cx="${tooltipX + 18}" cy="${tooltipY + 38}" r="4" fill="#137f4a" />
        <text x="${tooltipX + 30}" y="${tooltipY + 42}" fill="#251918" font-size="12">Max ${escapeHtml(formatCurrency(activePoint.maxPrice))}</text>
        <circle cx="${tooltipX + 18}" cy="${tooltipY + 56}" r="4" fill="#c1262c" />
        <text x="${tooltipX + 30}" y="${tooltipY + 60}" fill="#251918" font-size="12">Min ${escapeHtml(formatCurrency(activePoint.minPrice))}</text>
        <circle cx="${tooltipX + 18}" cy="${tooltipY + 74}" r="4" fill="#d9a320" />
        <text x="${tooltipX + 30}" y="${tooltipY + 78}" fill="#251918" font-size="12">Modal ${escapeHtml(formatCurrency(activePoint.modalPrice))}</text>
      </g>
    `;

    const pointTargets = rows.map((row, index) => {
      const x = toX(index);
      const maxY = toY(row.maxPrice);
      const minY = toY(row.minPrice);
      const modalY = toY(row.modalPrice);
      const isActive = row.reportDate === activePoint.reportDate;
      return `
        <g data-chart-date="${escapeAttribute(row.reportDate)}" class="chart-point-group ${isActive ? "is-active" : ""}">
          <line x1="${x}" y1="${paddingY}" x2="${x}" y2="${height - paddingY}" stroke="${isActive ? "#d85a4c" : "transparent"}" stroke-dasharray="5 5" />
          <circle cx="${x}" cy="${maxY}" r="${isActive ? 5 : 3.5}" fill="#137f4a" stroke="#fffaf6" stroke-width="2" />
          <circle cx="${x}" cy="${minY}" r="${isActive ? 5 : 3.5}" fill="#c1262c" stroke="#fffaf6" stroke-width="2" />
          <circle cx="${x}" cy="${modalY}" r="${isActive ? 5 : 3.5}" fill="#d9a320" stroke="#fffaf6" stroke-width="2" />
          <rect x="${x - 16}" y="${paddingY}" width="32" height="${height - paddingY * 2}" fill="transparent" />
        </g>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Price history" data-chart-root="true">
        <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="#d6c5a5" />
        <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}" stroke="#d6c5a5" />
        <path d="${minPath}" fill="none" stroke="#c1262c" stroke-width="3" />
        <path d="${modalPath}" fill="none" stroke="#d9a320" stroke-width="3" stroke-dasharray="10 6" />
        <path d="${maxPath}" fill="none" stroke="#137f4a" stroke-width="3.5" />
        ${pointTargets}
        ${tooltip}
        ${labels}
      </svg>
    `;
  }

  function renderChartSummary(activePoint) {
    if (!activePoint) {
      return "";
    }

    return `
      <div class="chart-summary">
        <div class="chart-summary-head">
          <strong>${escapeHtml(formatDateFull(activePoint.reportDate))}</strong>
          <span>Selected point</span>
        </div>
        <div class="chart-summary-grid">
          <span class="chart-metric chart-metric-max">Max: ${formatCurrency(activePoint.maxPrice)}</span>
          <span class="chart-metric chart-metric-min">Min: ${formatCurrency(activePoint.minPrice)}</span>
          <span class="chart-metric chart-metric-modal">Modal: ${formatCurrency(activePoint.modalPrice)}</span>
        </div>
      </div>
    `;
  }

  function getActiveHistoryPoint(rows) {
    if (!rows.length) {
      return null;
    }

    const matched = rows.find((row) => row.reportDate === state.activeChartDate);
    return matched || rows[rows.length - 1];
  }

  function buildLinePath(points) {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  }

  function bindEvents() {
    const homeLink = document.getElementById("homeLink");
    if (homeLink) {
      homeLink.addEventListener("click", handleHomeClick);
    }

    const backHome = document.getElementById("backHome");
    if (backHome) {
      backHome.addEventListener("click", handleHomeClick);
    }

    document.querySelectorAll("[data-global-search]").forEach((input) => {
      input.addEventListener("input", handleSearchInput);
    });

    document.querySelectorAll("[data-locale-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        setLocale(button.dataset.localeToggle);
      });
    });

    document.querySelectorAll("[data-suggestion-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const result = state.suggestions[Number(button.dataset.suggestionIndex)];
        if (result) {
          handleSuggestionSelect(result);
        }
      });
    });

    document.querySelectorAll("[data-filter-toggle]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFilterMenu(button.dataset.filterToggle);
      });
    });

    document.querySelectorAll("[data-filter-option]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handleFilterChange(button.dataset.filterOption, button.dataset.filterValue);
      });
    });

    const clearFilters = document.getElementById("clearFilters");
    if (clearFilters) {
      clearFilters.addEventListener("click", handleClearFilters);
    }

    document.querySelectorAll("[data-row-key]").forEach((row) => {
      row.addEventListener("click", () => {
        const key = row.dataset.rowKey;
        if (state.expandedRowKey === key) {
          state.expandedRowKey = null;
          state.activeChartDate = null;
        } else {
          state.expandedRowKey = key;
          state.activeChartDate = null;
        }
        render();
      });
    });

    document.querySelectorAll("[data-close-history]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.expandedRowKey = null;
        state.activeChartDate = null;
        render();
      });
    });

    document.querySelectorAll("[data-chart-date]").forEach((node) => {
      const activate = (event) => {
        event.stopPropagation();
        setActiveChartDate(node.dataset.chartDate);
      };

      node.addEventListener("mouseenter", activate);
      node.addEventListener("click", activate);
      node.addEventListener("touchstart", activate, { passive: true });
    });

    document.querySelectorAll("[data-chart-root]").forEach((svg) => {
      svg.addEventListener("mouseleave", () => {
        state.activeChartDate = null;
        render();
      });
    });

    document.querySelectorAll("[data-map-zoom]").forEach((button) => {
      button.addEventListener("click", () => {
        zoomMap(button.dataset.mapZoom === "in" ? 1 : -1);
      });
    });

    document.querySelectorAll("[data-map-reset]").forEach((button) => {
      button.addEventListener("click", () => {
        resetMapViewport();
        render();
      });
    });

    document.querySelectorAll("[data-map-market]").forEach((button) => {
      if (button.tagName.toLowerCase() !== "button") {
        return;
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handleMapMarketSelect(button.dataset.mapMarket);
      });
    });

    wireMapInteractions();
  }

  function wireMapInteractions() {
    const viewport = document.querySelector("[data-map-viewport]");
    const rootSvg = document.querySelector(".map-canvas svg");
    if (!viewport || !rootSvg) {
      return;
    }

    rootSvg.removeAttribute("width");
    rootSvg.removeAttribute("height");
    rootSvg.classList.add("interactive-map");
    initializeMapViewBox(rootSvg);
    rootSvg.setAttribute("viewBox", formatViewBox(getCurrentMapViewBox()));

    const candidatePaths = [...rootSvg.querySelectorAll("path[id]")].filter((node) => {
      const bounds = typeof node.getBBox === "function" ? node.getBBox() : null;
      return bounds && bounds.width > 10 && bounds.height > 10;
    });

    const pathLookup = new Map();

    candidatePaths.forEach((path) => {
      const district = getDistrictForPath(path);
      if (!district) {
        return;
      }

      pathLookup.set(district.districtSlug, path);
      path.classList.add("map-region");
      path.classList.add("district");
      path.setAttribute("data-district-slug", district.districtSlug);
      styleMapDistrictPath(path, district.districtSlug === state.activeMapDistrictSlug);

      if (district.districtSlug === state.activeMapDistrictSlug) {
        path.classList.add("is-active");
      }

      path.addEventListener("click", (event) => {
        if (shouldSuppressMapClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
        activateDistrictPath(path, district);
      });
    });

    rootSvg.addEventListener("click", (event) => {
      if (shouldSuppressMapClick()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const path = findSvgPathTarget(event.target);
      if (!path) {
        return;
      }

      const district = getDistrictForPath(path);
      if (!district) {
        return;
      }

      event.stopPropagation();
      activateDistrictPath(path, district);
    });

    renderMarketPins(rootSvg, pathLookup);
    bindMapGestures(viewport, rootSvg);
  }

  function activateDistrictPath(path, district) {
    const bounds = path.getBBox();
    focusMapRegion(bounds, district.districtSlug);
  }

  function styleMapDistrictPath(path, isActive) {
    const district = getDistrictForPath(path);
    if (!district) {
      return;
    }

    const colorIndex = Math.abs(hashString(district.districtSlug)) % MAP_DISTRICT_COLORS.length;
    const fill = MAP_DISTRICT_COLORS[colorIndex];

    path.style.fill = fill;
    path.style.stroke = isActive ? "#7f1218" : "#fff7f2";
    path.style.strokeWidth = isActive ? "2.8" : "1.4";
    path.style.opacity = isActive ? "1" : "0.94";
  }

  function findSvgPathTarget(target) {
    let node = target;

    while (node) {
      if (node.tagName && String(node.tagName).toLowerCase() === "path" && node.getAttribute("id")) {
        return node;
      }
      node = node.parentNode;
    }

    return null;
  }

  function renderMarketPins(rootSvg, pathLookup) {
    const existingLayer = rootSvg.querySelector("#market-pin-layer");
    if (existingLayer) {
      existingLayer.remove();
    }

    const district = getActiveMapDistrict();
    if (!district) {
      return;
    }

    const pathNode = pathLookup.get(district.districtSlug);
    if (!pathNode) {
      return;
    }

    const positions = buildMarketPinPositions(rootSvg, pathNode, district.markets.length);
    const markerLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    markerLayer.setAttribute("id", "market-pin-layer");
    markerLayer.setAttribute("class", "map-marker-layer");

    positions.forEach((position, index) => {
      const market = district.markets[index];
      if (!market) {
        return;
      }

      markerLayer.appendChild(createMarketMarker(rootSvg, market.market, position));
    });

    rootSvg.appendChild(markerLayer);
  }

  function buildMarketPinPositions(rootSvg, pathNode, count) {
    const bounds = pathNode.getBBox();
    const candidates = [];
    const cols = Math.max(5, Math.ceil(Math.sqrt(count) * 4));
    const rows = Math.max(5, Math.ceil(Math.sqrt(count) * 4));
    const insetX = Math.max(bounds.width * 0.08, 4);
    const insetY = Math.max(bounds.height * 0.08, 4);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = bounds.x + insetX + ((bounds.width - insetX * 2) * (cols === 1 ? 0.5 : col / (cols - 1)));
        const y = bounds.y + insetY + ((bounds.height - insetY * 2) * (rows === 1 ? 0.5 : row / (rows - 1)));
        if (isPointInsideDistrict(rootSvg, pathNode, x, y)) {
          candidates.push({ x, y });
        }
      }
    }

    if (!candidates.length) {
      return Array.from({ length: count }, () => ({
        x: bounds.x + (bounds.width / 2),
        y: bounds.y + (bounds.height / 2),
      }));
    }

    return selectDistributedPoints(candidates, count, bounds);
  }

  function createMarketMarker(rootSvg, marketName, position) {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
    marker.setAttribute("class", "market-marker");
    marker.setAttribute("data-map-market", marketName);
    marker.setAttribute("role", "button");
    marker.setAttribute("tabindex", "0");
    marker.setAttribute("aria-label", `Open ${marketName} market table`);
    marker.setAttribute("transform", `translate(${position.x} ${position.y})`);

    const stem = document.createElementNS("http://www.w3.org/2000/svg", "line");
    stem.setAttribute("x1", "0");
    stem.setAttribute("y1", "-3");
    stem.setAttribute("x2", "0");
    stem.setAttribute("y2", "-17");
    stem.setAttribute("class", "market-marker-stem");

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", "0");
    dot.setAttribute("cy", "0");
    dot.setAttribute("r", "6");
    dot.setAttribute("class", "market-marker-dot");

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "0");
    label.setAttribute("y", "-22");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "market-marker-label");
    label.textContent = translateEntity("market", marketName);

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("cx", "0");
    hit.setAttribute("cy", "-10");
    hit.setAttribute("r", "28");
    hit.setAttribute("class", "market-marker-hit");

    const activate = (event) => {
      if (shouldSuppressMapClick()) {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      handleMapMarketSelect(marketName);
    };

    marker.addEventListener("click", activate);
    marker.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        activate(event);
      }
    });

    marker.appendChild(hit);
    marker.appendChild(stem);
    marker.appendChild(dot);
    marker.appendChild(label);

    return marker;
  }

  function bindMapGestures(viewport, rootSvg) {
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      const currentViewBox = getCurrentMapViewBox();
      if (!currentViewBox) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const anchor = clientToSvgPoint(event.clientX, event.clientY, currentViewBox, rect);
      const ratio = clientToRatio(event.clientX, event.clientY, rect);
      const scale = event.deltaY < 0 ? 0.9 : 1.1;
      const nextWidth = currentViewBox[2] * scale;
      const nextHeight = currentViewBox[3] * scale;
      state.mapViewBox = constrainMapViewBox([
        anchor.x - (ratio.x * nextWidth),
        anchor.y - (ratio.y * nextHeight),
        nextWidth,
        nextHeight,
      ]);
      rootSvg.setAttribute("viewBox", formatViewBox(getCurrentMapViewBox()));
    }, { passive: false });

    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        return;
      }

      const currentViewBox = getCurrentMapViewBox();
      if (!currentViewBox) {
        return;
      }

      mapGesture.pointerId = event.pointerId;
      mapGesture.isPanning = true;
      mapGesture.panStartClient = { x: event.clientX, y: event.clientY };
      mapGesture.panStartViewBox = currentViewBox;
      mapGesture.didMove = false;
      viewport.setPointerCapture(event.pointerId);
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!mapGesture.isPanning || mapGesture.pointerId !== event.pointerId || event.pointerType === "touch") {
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const deltaX = (event.clientX - mapGesture.panStartClient.x) / Math.max(rect.width, 1);
      const deltaY = (event.clientY - mapGesture.panStartClient.y) / Math.max(rect.height, 1);
      const start = mapGesture.panStartViewBox;
      state.mapViewBox = constrainMapViewBox([
        start[0] - (deltaX * start[2]),
        start[1] - (deltaY * start[3]),
        start[2],
        start[3],
      ]);
      mapGesture.didMove = mapGesture.didMove || Math.abs(event.clientX - mapGesture.panStartClient.x) > 5 || Math.abs(event.clientY - mapGesture.panStartClient.y) > 5;
      rootSvg.setAttribute("viewBox", formatViewBox(getCurrentMapViewBox()));
    });

    viewport.addEventListener("pointerup", finalizePointerPan);
    viewport.addEventListener("pointercancel", finalizePointerPan);
    viewport.addEventListener("lostpointercapture", finalizePointerPan);

    viewport.addEventListener("touchstart", (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const currentViewBox = getCurrentMapViewBox();
        if (!currentViewBox) {
          return;
        }

        const rect = viewport.getBoundingClientRect();
        const center = getTouchMidpoint(event.touches[0], event.touches[1]);
        mapGesture.touchMode = "pinch";
        mapGesture.didMove = false;
        mapGesture.pinchStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
        mapGesture.pinchStartViewBox = currentViewBox;
        mapGesture.pinchAnchorSvg = clientToSvgPoint(center.x, center.y, currentViewBox, rect);
        return;
      }

      if (event.touches.length === 1) {
        const currentViewBox = getCurrentMapViewBox();
        if (!currentViewBox || !isMapZoomedIn()) {
          return;
        }

        const touch = event.touches[0];
        mapGesture.touchMode = "pan";
        mapGesture.didMove = false;
        mapGesture.panStartClient = { x: touch.clientX, y: touch.clientY };
        mapGesture.panStartViewBox = currentViewBox;
      }
    }, { passive: false });

    viewport.addEventListener("touchmove", (event) => {
      if (event.touches.length === 2 && mapGesture.touchMode === "pinch") {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const center = getTouchMidpoint(event.touches[0], event.touches[1]);
        const ratio = clientToRatio(center.x, center.y, rect);
        const nextDistance = getTouchDistance(event.touches[0], event.touches[1]);
        if (!nextDistance || !mapGesture.pinchStartDistance) {
          return;
        }

        const scale = mapGesture.pinchStartDistance / nextDistance;
        const start = mapGesture.pinchStartViewBox;
        const nextWidth = start[2] * scale;
        const nextHeight = start[3] * scale;
        state.mapViewBox = constrainMapViewBox([
          mapGesture.pinchAnchorSvg.x - (ratio.x * nextWidth),
          mapGesture.pinchAnchorSvg.y - (ratio.y * nextHeight),
          nextWidth,
          nextHeight,
        ]);
        mapGesture.didMove = true;
        rootSvg.setAttribute("viewBox", formatViewBox(getCurrentMapViewBox()));
        return;
      }

      if (event.touches.length === 1 && mapGesture.touchMode === "pan") {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const touch = event.touches[0];
        const deltaX = (touch.clientX - mapGesture.panStartClient.x) / Math.max(rect.width, 1);
        const deltaY = (touch.clientY - mapGesture.panStartClient.y) / Math.max(rect.height, 1);
        const start = mapGesture.panStartViewBox;
        state.mapViewBox = constrainMapViewBox([
          start[0] - (deltaX * start[2]),
          start[1] - (deltaY * start[3]),
          start[2],
          start[3],
        ]);
        mapGesture.didMove = mapGesture.didMove || Math.abs(touch.clientX - mapGesture.panStartClient.x) > 5 || Math.abs(touch.clientY - mapGesture.panStartClient.y) > 5;
        rootSvg.setAttribute("viewBox", formatViewBox(getCurrentMapViewBox()));
      }
    }, { passive: false });

    viewport.addEventListener("touchend", finalizeTouchGesture);
    viewport.addEventListener("touchcancel", finalizeTouchGesture);
  }

  function finalizePointerPan(event) {
    if (mapGesture.pointerId !== null && event.pointerId !== undefined && mapGesture.pointerId !== event.pointerId) {
      return;
    }

    if (mapGesture.didMove) {
      mapGesture.suppressClickUntil = Date.now() + 250;
    }

    mapGesture.pointerId = null;
    mapGesture.isPanning = false;
    mapGesture.panStartClient = null;
    mapGesture.panStartViewBox = null;
    mapGesture.didMove = false;
  }

  function finalizeTouchGesture(event) {
    if (event.touches.length === 2) {
      return;
    }

    if (mapGesture.didMove) {
      mapGesture.suppressClickUntil = Date.now() + 300;
    }

    if (event.touches.length === 1 && isMapZoomedIn()) {
      const touch = event.touches[0];
      mapGesture.touchMode = "pan";
      mapGesture.panStartClient = { x: touch.clientX, y: touch.clientY };
      mapGesture.panStartViewBox = getCurrentMapViewBox();
      mapGesture.didMove = false;
      return;
    }

    mapGesture.touchMode = null;
    mapGesture.panStartClient = null;
    mapGesture.panStartViewBox = null;
    mapGesture.pinchStartDistance = 0;
    mapGesture.pinchStartViewBox = null;
    mapGesture.pinchAnchorSvg = null;
    mapGesture.didMove = false;
  }

  function shouldSuppressMapClick() {
    return Date.now() < mapGesture.suppressClickUntil;
  }

  function getActiveMapDistrict() {
    if (!state.activeMapDistrictSlug) {
      return null;
    }

    return state.mapDistricts.find((district) => district.districtSlug === state.activeMapDistrictSlug) || null;
  }

  function getDistrictForPath(pathNode) {
    const districtName = pathNode.getAttribute("data-district") || pathNode.id || "";
    const districtKey = toDistrictKey(districtName);
    return state.mapDistricts.find((district) => {
      return toDistrictKey(district.district) === districtKey || toDistrictKey(district.districtSlug) === districtKey;
    }) || null;
  }

  function toDistrictKey(value) {
    let normalized = String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[()]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const aliases = {
      "bagalkote": "bagalkot",
      "bengaluru urban": "bengaluru urban",
      "bengaluru rural": "bengaluru rural",
      "chamarajanagara": "chamarajanagar",
      "kalaburagi": "kalaburagi",
      "kalburgi": "kalaburagi",
      "kolar": "kolar",
      "kolara": "kolar",
    };

    normalized = aliases[normalized] || normalized;
    return normalized.replace(/\s+/g, "-");
  }

  function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(index);
      hash |= 0;
    }
    return hash;
  }

  function initializeMapViewBox(rootSvg) {
    const parsedViewBox = parseViewBox(rootSvg.getAttribute("viewBox"));
    const baseViewBox = parsedViewBox || [0, 0, 800, 1218];
    if (!state.mapBaseViewBox) {
      state.mapBaseViewBox = [...baseViewBox];
    }
    if (!state.mapViewBox) {
      state.mapViewBox = [...state.mapBaseViewBox];
    }
  }

  function getCurrentMapViewBox() {
    if (state.mapViewBox) {
      return [...state.mapViewBox];
    }
    if (state.mapBaseViewBox) {
      return [...state.mapBaseViewBox];
    }
    return null;
  }

  function isMapZoomedIn() {
    if (!state.mapBaseViewBox) {
      return false;
    }

    const current = getCurrentMapViewBox();
    return current ? current[2] < state.mapBaseViewBox[2] : false;
  }

  function parseViewBox(value) {
    const parts = String(value || "").trim().split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
      return null;
    }
    return parts;
  }

  function formatViewBox(viewBox) {
    return viewBox.map((value) => Number(value.toFixed(2))).join(" ");
  }

  function clientToRatio(clientX, clientY, rect) {
    return {
      x: clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
      y: clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
    };
  }

  function clientToSvgPoint(clientX, clientY, viewBox, rect) {
    const ratio = clientToRatio(clientX, clientY, rect);
    return {
      x: viewBox[0] + (ratio.x * viewBox[2]),
      y: viewBox[1] + (ratio.y * viewBox[3]),
    };
  }

  function scaleMapViewBox(viewBox, scale) {
    const [x, y, width, height] = viewBox;
    const centerX = x + (width / 2);
    const centerY = y + (height / 2);
    const nextWidth = width * scale;
    const nextHeight = height * scale;
    return constrainMapViewBox([
      centerX - (nextWidth / 2),
      centerY - (nextHeight / 2),
      nextWidth,
      nextHeight,
    ]);
  }

  function constrainMapViewBox(viewBox) {
    if (!state.mapBaseViewBox) {
      return viewBox;
    }

    const base = state.mapBaseViewBox;
    const minWidth = base[2] * 0.18;
    const minHeight = base[3] * 0.18;
    const width = clamp(viewBox[2], minWidth, base[2]);
    const height = clamp(viewBox[3], minHeight, base[3]);
    let x = viewBox[0];
    let y = viewBox[1];
    const maxX = base[0] + base[2] - width;
    const maxY = base[1] + base[3] - height;

    x = clamp(x, base[0], maxX);
    y = clamp(y, base[1], maxY);

    return [x, y, width, height];
  }

  function isPointInsideDistrict(rootSvg, pathNode, x, y) {
    if (typeof pathNode.isPointInFill === "function") {
      const point = rootSvg.createSVGPoint();
      point.x = x;
      point.y = y;
      return pathNode.isPointInFill(point);
    }

    const bounds = pathNode.getBBox();
    return x >= bounds.x
      && x <= bounds.x + bounds.width
      && y >= bounds.y
      && y <= bounds.y + bounds.height;
  }

  function selectDistributedPoints(candidates, count, bounds) {
    const center = {
      x: bounds.x + (bounds.width / 2),
      y: bounds.y + (bounds.height / 2),
    };
    const selected = [];
    const remaining = [...candidates];

    remaining.sort((left, right) => {
      return distanceBetween(left, center) - distanceBetween(right, center);
    });

    if (remaining.length) {
      selected.push(remaining.shift());
    }

    while (selected.length < count && remaining.length) {
      let bestIndex = 0;
      let bestScore = -1;

      remaining.forEach((candidate, index) => {
        const distance = Math.min(...selected.map((point) => distanceBetween(candidate, point)));
        if (distance > bestScore) {
          bestScore = distance;
          bestIndex = index;
        }
      });

      selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    while (selected.length < count) {
      selected.push(center);
    }

    return selected;
  }

  function distanceBetween(left, right) {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function getTouchDistance(first, second) {
    const dx = second.clientX - first.clientX;
    const dy = second.clientY - first.clientY;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function getTouchMidpoint(first, second) {
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
  }

  function highlightMatch(text, query) {
    if (!query.trim()) {
      return escapeHtml(text);
    }

    const lowerText = normalizeSearchText(text);
    const lowerQuery = normalizeSearchText(query);
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) {
      return escapeHtml(text);
    }

    const before = escapeHtml(text.slice(0, index));
    const match = escapeHtml(text.slice(index, index + query.length));
    const after = escapeHtml(text.slice(index + query.length));
    return `${before}<strong>${match}</strong>${after}`;
  }

  function formatCurrency(value) {
    return Number(value).toLocaleString("en-IN");
  }

  function formatNumber(value) {
    return Number(value).toLocaleString("en-IN");
  }

  function formatDateShort(value) {
    const [year, month, day] = String(value).split("-");
    return `${day}-${month}`;
  }

  function formatDateFull(value) {
    const [year, month, day] = String(value).split("-");
    return `${day}-${month}-${year}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getAllLabel(field) {
    if (field === "variety") {
      return "All varieties";
    }
    if (field === "commodity") {
      return "All commodities";
    }
    if (field === "market") {
      return "All markets";
    }
    return `All ${field}`;
  }

  function setLocale(locale) {
    if (locale !== "en" && locale !== "kn") {
      return;
    }

    state.locale = locale;
    storeLocale(locale);
    if (state.query.trim() && hasClientSearchIndex()) {
      state.suggestions = buildLocalizedSearchResults(state.query.trim());
    }
    render();
  }

  function getStoredLocale() {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      return stored === "kn" ? "kn" : "en";
    } catch (error) {
      return "en";
    }
  }

  function storeLocale(locale) {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch (error) {
      // Storage is optional for this feature.
    }
  }

  function translateEntity(field, value) {
    const translationGroup = getTranslationGroup(field);
    const entry = translationGroup[String(value)] || null;
    if (!entry) {
      return String(value);
    }

    if (state.locale === "kn" && entry.kn) {
      return entry.kn;
    }

    return entry.en || String(value);
  }

  function translateEntityWithLocale(field, value, locale) {
    const translationGroup = getTranslationGroup(field);
    const entry = translationGroup[String(value)] || null;
    if (!entry) {
      return String(value);
    }

    if (locale === "kn" && entry.kn) {
      return entry.kn;
    }

    return entry.en || String(value);
  }

  function getTranslationGroup(field) {
    if (field === "commodity") {
      return state.translations.commodities || {};
    }
    if (field === "market") {
      return state.translations.markets || {};
    }
    if (field === "variety") {
      return state.translations.varieties || {};
    }
    return {};
  }

  function hasClientSearchIndex() {
    return state.searchIndex.commodities.length > 0
      || state.searchIndex.markets.length > 0
      || state.searchIndex.varieties.length > 0;
  }

  function buildLocalizedSearchResults(query) {
    const normalizedQuery = normalizeSearchText(query);
    const commodityResults = state.searchIndex.commodities
      .map((name) => buildCommoditySearchResult(name, normalizedQuery))
      .filter(Boolean)
      .sort(compareLocalizedSearchResults)
      .slice(0, 6);

    const marketResults = state.searchIndex.markets
      .map((name) => buildMarketSearchResult(name, normalizedQuery))
      .filter(Boolean)
      .sort(compareLocalizedSearchResults)
      .slice(0, 6);

    const varietyResults = state.searchIndex.varieties
      .map((item) => buildVarietySearchResult(item, normalizedQuery))
      .filter(Boolean)
      .sort(compareLocalizedSearchResults)
      .slice(0, 8);

    return [...commodityResults, ...marketResults, ...varietyResults].slice(0, 12);
  }

  function buildCommoditySearchResult(name, query) {
    const score = getLocalizedMatchScore([
      name,
      translateEntityWithLocale("commodity", name, "en"),
      translateEntityWithLocale("commodity", name, "kn"),
    ], query);
    return score ? { type: "commodity", commodity: name, score } : null;
  }

  function buildMarketSearchResult(name, query) {
    const score = getLocalizedMatchScore([
      name,
      translateEntityWithLocale("market", name, "en"),
      translateEntityWithLocale("market", name, "kn"),
    ], query);
    return score ? { type: "market", market: name, score } : null;
  }

  function buildVarietySearchResult(item, query) {
    const score = getLocalizedMatchScore([
      item.variety,
      item.commodity,
      translateEntityWithLocale("variety", item.variety, "en"),
      translateEntityWithLocale("variety", item.variety, "kn"),
      translateEntityWithLocale("commodity", item.commodity, "en"),
      translateEntityWithLocale("commodity", item.commodity, "kn"),
    ], query);
    return score ? {
      type: "variety",
      commodity: item.commodity,
      variety: item.variety,
      score,
    } : null;
  }

  function getLocalizedMatchScore(candidates, query) {
    let best = null;

    candidates.forEach((candidate) => {
      const normalizedCandidate = normalizeSearchText(candidate);
      const index = normalizedCandidate.indexOf(query);
      if (index === -1) {
        return;
      }

      const score = {
        startsWith: index === 0 ? 0 : 1,
        position: index,
        length: normalizedCandidate.length,
      };

      if (!best || compareMatchScore(score, best) < 0) {
        best = score;
      }
    });

    return best;
  }

  function compareLocalizedSearchResults(left, right) {
    const scoreCompare = compareMatchScore(left.score, right.score);
    if (scoreCompare !== 0) {
      return scoreCompare;
    }
    return getSuggestionLabel(left).localeCompare(getSuggestionLabel(right));
  }

  function compareMatchScore(left, right) {
    if (left.startsWith !== right.startsWith) {
      return left.startsWith - right.startsWith;
    }
    if (left.position !== right.position) {
      return left.position - right.position;
    }
    return left.length - right.length;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
