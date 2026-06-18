(function() {
  const app = document.getElementById("app");
  const LOCALE_STORAGE_KEY = "commodity-dashboard-locale";
  const FILTER_HINT_DURATION_MS = 5000;
  const FILTER_HINT_COLLAPSE_MS = 320;
  const SEARCH_INPUT_DEBOUNCE_MS = 120;
  const PRICE_COLORS = {
    max: "#1E3A8A",
    min: "#C2410C",
    modal: "#CC9900",
  };
  const CATEGORY_ICONS = {
    fruits: "🍎",
    vegetables: "🥕",
    nuts_and_seeds: "🌰",
    grains_and_pulses: "🌾",
    miscellaneous: "🧺",
  };
  const COMMODITY_ICONS = {
    Apple: "🍎",
    Banana: "🍌",
    "Banana Green": "🍌",
    Grapes: "🍇",
    Guava: "🍐",
    "Jack Fruit": "🍈",
    Karbuja: "🍈",
    "Lime (Lemon)": "🍋",
    Mango: "🥭",
    "Mango (Raw-Ripe)": "🥭",
    Mousambi: "🍊",
    Orange: "🍊",
    Papaya: "🍈",
    "Pine Apple": "🍍",
    Pomagranate: "🍎",
    "Tamarind Fruit": "🫛",
    "Water Melon": "🍉",
    Onion: "🧅",
    Potato: "🥔",
    Tomato: "🍅",
    Carrot: "🥕",
    Beetroot: "🫜",
    Cabbage: "🥬",
    Cauliflower: "🥦",
    Capsicum: "🫑",
    "Green Chilly": "🌶️",
    "Chilly Red": "🌶️",
    Garlic: "🧄",
    Ginger: "🫚",
    "Sweet Potato": "🍠",
    "Tender Coconut": "🥥",
    "Coconut (Per 1000)": "🥥",
    Copra: "🥥",
    Groundnut: "🥜",
    Cashewnut: "🌰",
    Arecanut: "🌰",
    Pepper: "🫛",
    Paddy: "🌾",
    Rice: "🍚",
    Wheat: "🌾",
    Maize: "🌽",
    Jowar: "🌾",
    Ragi: "🌾",
    Bajra: "🌾",
    Barley: "🌾",
    "Foxtail Millet": "🌾",
    Navane: "🌾",
    "Same/Savi": "🌾",
    Soyabeen: "🫘",
    Greengram: "🫘",
    "Green Gramdal": "🫘",
    Bengalgram: "🫘",
    "Bengal Gramdal": "🫘",
    Blackgram: "🫘",
    "Black Gramdal": "🫘",
    Cowpea: "🫘",
    "Horse Gram": "🫘",
    Redgram: "🫘",
    Tur: "🫘",
    "Tur Dal": "🫘",
  };

  const state = {
    route: parseRoute(),
    query: "",
    suggestions: [],
    context: null,
    allRows: [],
    baseRows: [],
    filters: {},
    filterDrafts: {},
    filterSearches: {},
    pendingFilterSelection: null,
    activeFilterField: "",
    isFilterModalOpen: false,
    showFilterHint: false,
    shouldScrollTableIntoView: false,
    shouldPrimeExpandedHistory: false,
    activeChartDate: null,
    expandedRowKey: null,
    searchToken: 0,
    locale: getStoredLocale(),
    translations: {
      ui: {},
      commodities: {},
      markets: {},
      varieties: {},
    },
    searchIndex: {
      commodities: [],
      markets: [],
      varieties: [],
    },
    categoryGroups: [],
    activeHomeCategoryId: "",
    shouldRevealActiveHomeCategory: false,
    mapSvgMarkup: "",
    mapDistricts: [],
    mapBaseViewBox: null,
    mapViewBox: null,
    activeMapDistrictSlug: "",
    cachedVisibleRowsKey: "",
    cachedVisibleRows: [],
    cachedFilterOptions: {},
  };

  let filterHintTimer = null;
  let filterHintFinalizeTimer = null;
  let searchInputTimer = null;
  let renderFrameId = null;
  let stickyTableHeaderCleanup = null;

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
  setupVisualViewportTracking();

  boot();

  async function boot() {
    if (state.route.view === "table") {
      primeTableArrivalUi();
    }

    render();

    await Promise.all([
      loadTranslations(),
      loadSearchIndex(),
      loadCategoryGroups(),
      loadMapSvg(),
      loadMapData(),
      loadObservations(),
    ]);

    if (state.route.view === "table") {
      loadContext();
      return;
    }

    render();
  }

  async function loadMapSvg() {
    try {
      const response = await fetch("./karnataka-geo.svg");
      if (!response.ok) {
        throw new Error(`Map request failed: ${response.status}`);
      }

      const svgText = await response.text();
      state.mapSvgMarkup = svgText;
    } catch (error) {
      state.mapSvgMarkup = "";
    }

  }

  async function loadMapData() {
    try {
      const payload = await fetchJson("./data/map-data.json");
      state.mapDistricts = payload.districts || [];
    } catch (error) {
      state.mapDistricts = [];
    }

  }

  async function loadTranslations() {
    try {
      const payload = await fetchJson("./translations.json");
      state.translations = {
        ui: payload.ui || {},
        commodities: payload.commodities || {},
        markets: payload.markets || {},
        varieties: payload.varieties || {},
      };
    } catch (error) {
      state.translations = {
        ui: {},
        commodities: {},
        markets: {},
        varieties: {},
      };
    }

  }

  async function loadSearchIndex() {
    try {
      const payload = await fetchJson("./data/search-index.json");
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
    }
  }

  async function loadCategoryGroups() {
    try {
      const payload = await fetchJson("./data/categories.json");
      state.categoryGroups = Array.isArray(payload.categories) ? payload.categories : [];
    } catch (error) {
      state.categoryGroups = [];
    }

    if (!state.categoryGroups.length) {
      state.activeHomeCategoryId = "";
      return;
    }

    const hasActiveCategory = state.categoryGroups.some((category) => category.id === state.activeHomeCategoryId);
    if (!hasActiveCategory) {
      state.activeHomeCategoryId = state.categoryGroups[0].id;
    }
  }

  async function loadObservations() {
    try {
      state.allRows = await fetchJson("./data/observations.json");
    } catch (error) {
      state.allRows = [];
    }

    invalidateDerivedDataCaches();
  }

  function normalizeResultsLayout(layout) {
    return layout === "table" ? "table" : "cards";
  }

  function parseRoute() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") === "table" ? "table" : "home";
    return {
      view,
      layout: view === "table" ? normalizeResultsLayout(params.get("layout")) : "cards",
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
      params.set("layout", normalizeResultsLayout(route.layout));
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
    const basePath = window.location.pathname || "./";
    return query ? `${basePath}?${query}` : basePath;
  }

  function navigate(route) {
    const nextUrl = buildRouteUrl(route);
    window.history.pushState({}, "", nextUrl);
    state.route = route;
    state.context = null;
    state.baseRows = [];
    state.filters = {};
    state.filterDrafts = {};
    state.filterSearches = {};
    state.pendingFilterSelection = null;
    state.activeFilterField = "";
    state.isFilterModalOpen = false;
    state.showFilterHint = false;
    state.shouldScrollTableIntoView = false;
    state.shouldPrimeExpandedHistory = false;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    state.suggestions = [];
    invalidateDerivedDataCaches();
    if (route.view === "table") {
      primeTableArrivalUi();
    } else {
      clearFilterHintTimers();
    }

    scheduleRender();
    if (route.view === "table") {
      loadContext();
    }
  }

  function handlePopState() {
    state.route = parseRoute();
    state.context = null;
    state.baseRows = [];
    state.filters = {};
    state.filterDrafts = {};
    state.filterSearches = {};
    state.pendingFilterSelection = null;
    state.activeFilterField = "";
    state.isFilterModalOpen = false;
    state.showFilterHint = false;
    state.shouldScrollTableIntoView = false;
    state.shouldPrimeExpandedHistory = false;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    state.suggestions = [];
    invalidateDerivedDataCaches();
    if (state.route.view === "table") {
      primeTableArrivalUi();
    } else {
      clearFilterHintTimers();
    }

    scheduleRender();
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
    if (query !== state.query) {
      return;
    }

    const token = ++state.searchToken;
    if (!query.trim()) {
      state.suggestions = [];
      syncSearchSuggestionsUi();
      return;
    }

    if (hasClientSearchIndex()) {
      if (token !== state.searchToken) {
        return;
      }
      state.suggestions = buildLocalizedSearchResults(query.trim());
      syncSearchSuggestionsUi();
      return;
    }

    state.suggestions = [];
    syncSearchSuggestionsUi();
  }

  async function loadContext() {
    const route = state.route;

    try {
      const derived = deriveContext(route);
      state.context = derived.context;
      state.baseRows = derived.rows;
      state.filters = buildInitialFilters(derived.context.filters);
      state.filterDrafts = cloneFilters(state.filters);
      state.filterSearches = buildInitialFilterSearches(derived.context.filters);
      state.pendingFilterSelection = null;
      state.activeFilterField = "";
      state.isFilterModalOpen = false;
      state.activeChartDate = null;
      state.expandedRowKey = null;
      invalidateDerivedDataCaches();
    } catch (error) {
      state.context = {
        heading: "Unavailable",
        locked: {},
        filters: [],
      };
      state.baseRows = [];
      state.filters = {};
      state.filterDrafts = {};
      state.filterSearches = {};
      state.pendingFilterSelection = null;
      state.activeFilterField = "";
      state.isFilterModalOpen = false;
      state.activeChartDate = null;
      invalidateDerivedDataCaches();
    }
    scheduleRender();
  }

  function buildInitialFilters(filterNames) {
    const next = {};
    filterNames.forEach((name) => {
      next[name] = [];
    });
    return next;
  }

  function buildInitialFilterSearches(filterNames) {
    const next = {};
    filterNames.forEach((name) => {
      next[name] = "";
    });
    return next;
  }

  function cloneFilters(filters) {
    const next = {};
    Object.entries(filters).forEach(([key, values]) => {
      next[key] = [...values];
    });
    return next;
  }

  function deriveContext(route) {
    if (!state.allRows.length) {
      throw new Error("Observation data not loaded.");
    }

    if (route.type === "commodity") {
      if (!route.commodity) {
        throw new Error("Missing commodity.");
      }

      return {
        context: {
          type: "commodity",
          heading: route.commodity,
          locked: { commodity: route.commodity },
          filters: ["market", "variety"],
          resultLabel: `${route.commodity} (Commodity)`,
        },
        rows: state.allRows.filter((row) => row.commodity === route.commodity),
      };
    }

    if (route.type === "market") {
      if (!route.market) {
        throw new Error("Missing market.");
      }

      return {
        context: {
          type: "market",
          heading: route.market,
          locked: { market: route.market },
          filters: ["commodity", "variety"],
          resultLabel: `${route.market} (Market)`,
        },
        rows: state.allRows.filter((row) => row.market === route.market),
      };
    }

    if (route.type === "variety") {
      if (!route.commodity || !route.variety) {
        throw new Error("Missing commodity or variety.");
      }

      return {
        context: {
          type: "variety",
          heading: `${route.commodity} / ${route.variety}`,
          locked: { commodity: route.commodity, variety: route.variety },
          filters: ["market"],
          resultLabel: `${route.variety} (${route.commodity})`,
        },
        rows: state.allRows.filter((row) => {
          return row.commodity === route.commodity && row.variety === route.variety;
        }),
      };
    }

    throw new Error("Invalid context type.");
  }

  function handleDocumentClick(event) {
    if (event.target.closest(".shell-top")) {
      return;
    }

    if (!event.target.closest("[data-search-root]")) {
      if (state.suggestions.length) {
        state.suggestions = [];
        syncSearchSuggestionsUi();
        return;
      }
    }
  }

  function handleSearchInput(event) {
    state.query = event.target.value;
    scheduleSearchInputWork(state.query);
  }

  function handleSuggestionSelect(result) {
    const route = {
      view: "table",
      layout: state.route.view === "table" ? normalizeResultsLayout(state.route.layout) : "cards",
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
      layout: "cards",
      type: "",
      commodity: "",
      market: "",
      variety: "",
    });
  }

  function handleMapMarketSelect(market) {
    navigate({
      view: "table",
      layout: "cards",
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
    scheduleRender();
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
    scheduleRender();
  }

  function openFilterModal() {
    state.filterDrafts = cloneFilters(state.filters);
    state.filterSearches = buildInitialFilterSearches(state.context ? state.context.filters : []);
    state.pendingFilterSelection = null;
    state.activeFilterField = "";
    state.isFilterModalOpen = true;
    scheduleRender();
  }

  function closeFilterModal() {
    state.filterDrafts = cloneFilters(state.filters);
    state.filterSearches = buildInitialFilterSearches(state.context ? state.context.filters : []);
    state.pendingFilterSelection = null;
    state.activeFilterField = "";
    state.isFilterModalOpen = false;
    scheduleRender();
  }

  function updateFilterSearch(name, value, selectionStart, selectionEnd) {
    state.activeFilterField = name;
    state.filterSearches[name] = value;
    state.pendingFilterSelection = {
      hadFocus: true,
      field: name,
      selectionStart,
      selectionEnd,
    };
    syncFilterFieldUi(name);
  }

  function activateFilterField(name) {
    if (state.activeFilterField === name) {
      return;
    }
    state.activeFilterField = name;
    syncAllFilterFieldUis();
  }

  function toggleDraftFilterValue(name, value) {
    const selected = state.filterDrafts[name] || [];
    if (selected.includes(value)) {
      state.filterDrafts[name] = selected.filter((entry) => entry !== value);
    } else {
      state.filterDrafts[name] = [...selected, value];
    }
    scheduleRender();
  }

  function removeDraftFilterValue(name, value) {
    state.filterDrafts[name] = (state.filterDrafts[name] || []).filter((entry) => entry !== value);
    scheduleRender();
  }

  function applyFilterDrafts() {
    state.filters = cloneFilters(state.filterDrafts);
    invalidateDerivedDataCaches();
    state.pendingFilterSelection = null;
    state.activeFilterField = "";
    state.isFilterModalOpen = false;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    scheduleRender();
  }

  function clearFilterDrafts() {
    Object.keys(state.filterDrafts).forEach((name) => {
      state.filterDrafts[name] = [];
      state.filterSearches[name] = "";
    });
    state.filters = cloneFilters(state.filterDrafts);
    invalidateDerivedDataCaches();
    state.pendingFilterSelection = null;
    state.activeFilterField = "";
    state.isFilterModalOpen = false;
    state.activeChartDate = null;
    state.expandedRowKey = null;
    scheduleRender();
  }

  function setActiveChartDate(date) {
    state.activeChartDate = date;
    scheduleRender();
  }

  function setResultsLayout(layout) {
    if (state.route.view !== "table") {
      return;
    }

    const nextLayout = normalizeResultsLayout(layout);
    if (nextLayout === normalizeResultsLayout(state.route.layout)) {
      return;
    }

    const nextRoute = {
      ...state.route,
      layout: nextLayout,
    };

    state.route = nextRoute;
    if (nextLayout !== "table") {
      state.shouldPrimeExpandedHistory = false;
    }
    window.history.pushState({}, "", buildRouteUrl(nextRoute));
    scheduleRender();
  }

  function getActiveResultsLayout() {
    return normalizeResultsLayout(state.route.layout);
  }

  function getRowsForCurrentView() {
    const cacheKey = buildVisibleRowsCacheKey();
    if (cacheKey && state.cachedVisibleRowsKey === cacheKey) {
      return state.cachedVisibleRows;
    }

    const filteredRows = state.baseRows.filter((row) => {
      return Object.entries(state.filters).every(([key, value]) => {
        return !value.length || value.includes(row[key]);
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

    const sortedRows = [...latestRows.values()].sort((left, right) => {
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

    state.cachedVisibleRowsKey = cacheKey;
    state.cachedVisibleRows = sortedRows;
    return sortedRows;
  }

  function buildLatestRowGroupKey(row) {
    return [
      row.commodity,
      row.market,
      row.variety,
      row.grade,
    ].join("|");
  }

  function getFilterOptions(field, sourceFilters = state.filters) {
    const cacheKey = `${field}::${serializeFilters(sourceFilters)}`;
    if (state.cachedFilterOptions[cacheKey]) {
      return state.cachedFilterOptions[cacheKey];
    }

    const rows = state.baseRows.filter((row) => {
      return Object.entries(sourceFilters).every(([key, value]) => {
        if (key === field) {
          return true;
        }
        return !value.length || value.includes(row[key]);
      });
    });
    const options = [...new Set(rows.map((row) => row[field]))].sort((left, right) => left.localeCompare(right));
    state.cachedFilterOptions[cacheKey] = options;
    return options;
  }

  function getDraftFilterOptions(field, query) {
    const options = getFilterOptions(field, state.filterDrafts);
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((value) => {
      return normalizeSearchText(translateEntity(field, value)).includes(normalizedQuery)
        || normalizeSearchText(value).includes(normalizedQuery);
    });
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

  function formatLockedHeadings() {
    if (!state.context) {
      return "";
    }
    return Object.entries(state.context.locked)
      .map(([key, value]) => `<span>${escapeHtml(getFieldLabel(key))}: ${escapeHtml(translateEntity(key, value))}</span>`)
      .join("");
  }

  function render() {
    const searchInputState = captureSearchInputState();
    const filterInputState = captureFilterInputState();
    const scrollState = captureScrollState();
    const rows = state.route.view === "table" && state.context ? getRowsForCurrentView() : [];
    teardownStickyTableHeader();

    app.innerHTML = `
      <div class="shell">
        <div class="shell-top">
          ${renderTopBar()}
        </div>
        <main>
          <section class="view ${state.route.view === "home" ? "active" : ""}" id="homeView">
            <div class="home-stack">
              <section class="panel welcome-card">
                <div class="welcome-copy">
                  <h2>${escapeHtml(getUiText("app_title"))}</h2>
                  <p>${escapeHtml(getUiText("home_intro"))}</p>
                </div>
              </section>

              ${renderSearchPanel()}

              ${renderCategorySection()}

              <aside class="panel map-card">
                <div>
                  <h3>${escapeHtml(getUiText("map_title"))}</h3>
                  <p class="muted">${escapeHtml(getUiText("map_intro"))}</p>
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
                    <div class="locked-headings">${formatLockedHeadings()}</div>
                    <p>${getResultsIntroCopy()}</p>
                  </div>
                </div>

                ${renderResultsLayoutToggle()}
                ${renderFilterLauncher()}
                ${getActiveResultsLayout() === "table" ? renderStickyTableHeader(rows) : ""}

                <div class="table-wrap" data-preserve-scroll-id="table-wrap">
                  ${renderResults(rows)}
                </div>
              </section>
            </div>
          </section>
        </main>
        ${renderFilterModal()}
      </div>
    `;

    bindEvents();
    restoreSearchInputState(searchInputState);
    restoreFilterInputState(filterInputState);
    restoreScrollState(scrollState);
    runPostRenderEffects();
  }

  function captureSearchInputState() {
    return captureFocusedInputState("[data-global-search]");
  }

  function restoreSearchInputState(snapshot) {
    restoreFocusedInputState(".view.active [data-global-search]", snapshot);
  }

  function captureFilterInputState() {
    if (state.pendingFilterSelection) {
      const snapshot = { ...state.pendingFilterSelection };
      state.pendingFilterSelection = null;
      return snapshot;
    }

    const snapshot = captureFocusedInputState("[data-filter-search]");
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      field: document.activeElement.dataset.filterSearch || "",
    };
  }

  function restoreFilterInputState(snapshot) {
    if (!snapshot || !snapshot.field) {
      return;
    }

    restoreFocusedInputState(`[data-filter-search="${snapshot.field}"]`, snapshot);
  }

  function captureFocusedInputState(selector) {
    const input = document.activeElement;
    if (!input || !input.matches(selector)) {
      return null;
    }

    return {
      hadFocus: document.activeElement === input,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    };
  }

  function restoreFocusedInputState(selector, snapshot) {
    if (!snapshot || !snapshot.hadFocus) {
      return;
    }

    const input = document.querySelector(selector);
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
    const tableScroller = tableWrap ? tableWrap.querySelector(".results-table-wrap") : null;
    const filterModalBody = document.querySelector("[data-preserve-scroll-id='filter-modal-body']");
    const filterResults = [...document.querySelectorAll("[data-preserve-scroll-id='filter-search-results']")];
    const chartScroll = document.querySelector("[data-preserve-scroll-id='chart-scroll']");
    const homeCategoryRail = document.querySelector("[data-home-category-rail]");
    const homeCommodityRail = document.querySelector("[data-home-commodity-rail]");
    return {
      windowX: window.scrollX,
      windowY: window.scrollY,
      homeCategoryRail: homeCategoryRail ? {
        scrollLeft: homeCategoryRail.scrollLeft,
      } : null,
      homeCommodityRail: homeCommodityRail ? {
        scrollLeft: homeCommodityRail.scrollLeft,
      } : null,
      tableWrap: (tableScroller || tableWrap) ? {
        scrollLeft: (tableScroller || tableWrap).scrollLeft,
        scrollTop: (tableScroller || tableWrap).scrollTop,
      } : null,
      filterModalBody: filterModalBody ? {
        scrollTop: filterModalBody.scrollTop,
      } : null,
      chartScroll: chartScroll ? {
        rowKey: chartScroll.dataset.chartRowKey || "",
        scrollLeft: chartScroll.scrollLeft,
        scrollTop: chartScroll.scrollTop,
      } : null,
      filterResults: filterResults.map((node) => ({
        field: node.dataset.filterField || "",
        scrollTop: node.scrollTop,
      })),
    };
  }

  function restoreScrollState(snapshot) {
    if (!snapshot) {
      return;
    }

    window.scrollTo(snapshot.windowX, snapshot.windowY);

    if (snapshot.homeCategoryRail) {
      const homeCategoryRail = document.querySelector("[data-home-category-rail]");
      if (homeCategoryRail) {
        homeCategoryRail.scrollLeft = snapshot.homeCategoryRail.scrollLeft;
      }
    }

    if (snapshot.homeCommodityRail) {
      const homeCommodityRail = document.querySelector("[data-home-commodity-rail]");
      if (homeCommodityRail) {
        homeCommodityRail.scrollLeft = snapshot.homeCommodityRail.scrollLeft;
      }
    }

    if (!snapshot.tableWrap) {
      if (snapshot.filterModalBody || (snapshot.filterResults && snapshot.filterResults.length)) {
        restoreFilterScrollState(snapshot);
      }
      return;
    }

    const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
    const tableScroller = tableWrap ? tableWrap.querySelector(".results-table-wrap") : null;
    const tableTarget = tableScroller || tableWrap;
    if (!tableTarget) {
      restoreChartScrollState(snapshot);
      if (snapshot.filterModalBody || (snapshot.filterResults && snapshot.filterResults.length)) {
        restoreFilterScrollState(snapshot);
      }
      return;
    }

    tableTarget.scrollLeft = snapshot.tableWrap.scrollLeft;
    tableTarget.scrollTop = snapshot.tableWrap.scrollTop;
    restoreChartScrollState(snapshot);
    restoreFilterScrollState(snapshot);
  }

  function restoreChartScrollState(snapshot) {
    if (!state.expandedRowKey) {
      return;
    }

    const chartScroll = document.querySelector("[data-preserve-scroll-id='chart-scroll']");
    if (!chartScroll) {
      return;
    }

    if (snapshot.chartScroll && snapshot.chartScroll.rowKey === state.expandedRowKey) {
      chartScroll.scrollLeft = snapshot.chartScroll.scrollLeft;
      chartScroll.scrollTop = snapshot.chartScroll.scrollTop;
      return;
    }

    if (chartScroll.dataset.chartInitialPosition === "right") {
      if (getActiveResultsLayout() === "table" && chartScroll.dataset.chartActiveX) {
        chartScroll.scrollLeft = getChartAnchoredScrollLeft(chartScroll);
        return;
      }
      chartScroll.scrollLeft = chartScroll.scrollWidth - chartScroll.clientWidth;
    }
  }

  function restoreFilterScrollState(snapshot) {
    if (snapshot.filterModalBody) {
      const filterModalBody = document.querySelector("[data-preserve-scroll-id='filter-modal-body']");
      if (filterModalBody) {
        filterModalBody.scrollTop = snapshot.filterModalBody.scrollTop;
      }
    }

    (snapshot.filterResults || []).forEach((entry) => {
      if (!entry.field) {
        return;
      }
      const node = document.querySelector(`[data-preserve-scroll-id='filter-search-results'][data-filter-field="${entry.field}"]`);
      if (node) {
        node.scrollTop = entry.scrollTop;
      }
    });
  }

  function renderSearchPanel() {
    return `
      <section class="panel search-panel" data-search-root>
        <label class="search-label">${escapeHtml(getUiText("search_label"))}</label>
        <div class="search-box">
          <span>&#8981;</span>
          <input
            type="text"
            autocomplete="off"
            placeholder="${escapeAttribute(getUiText("search_placeholder"))}"
            value="${escapeAttribute(state.query)}"
            data-global-search="true"
          >
        </div>
        <div data-search-suggestions>${state.suggestions.length ? renderSuggestions() : ""}</div>
      </section>
    `;
  }

  function renderCategorySection() {
    if (!state.categoryGroups.length) {
      return "";
    }

    const activeCategory = getActiveHomeCategory();
    if (!activeCategory) {
      return "";
    }

    return `
      <section class="panel category-panel" aria-label="Commodity categories">
        <div class="category-panel-head">
          <div>
            <h3>${escapeHtml(getUiText("category_title"))}</h3>
            <p class="muted category-swipe-hint">${escapeHtml(getUiText("category_swipe_hint"))}</p>
          </div>
        </div>

        <div class="category-rail" role="tablist" aria-label="Commodity categories" data-home-category-rail="true">
          ${state.categoryGroups.map((category) => {
            const isActive = category.id === state.activeHomeCategoryId;
            return `
              <button
                type="button"
                class="category-pill ${isActive ? "is-active" : ""}"
                data-home-category="${escapeAttribute(category.id)}"
                role="tab"
                aria-selected="${isActive ? "true" : "false"}"
              >
                <span class="category-pill-icon" aria-hidden="true">${escapeHtml(getCategoryIcon(category.id))}</span>
                <span class="category-pill-copy">
                  <strong>${escapeHtml(getCategoryLabel(category.id, category.label))}</strong>
                </span>
              </button>
            `;
          }).join("")}
        </div>

        <div class="commodity-rail-wrap">
          <div class="commodity-rail-meta">
            <span class="commodity-rail-count">${formatCountLabel(activeCategory.commodityCount, "commodity", "commodities")}</span>
          </div>
          <div class="commodity-rail" aria-label="${escapeAttribute(getCategoryLabel(activeCategory.id, activeCategory.label))} commodities" data-home-commodity-rail="true">
            ${activeCategory.commodities.map((commodity) => `
              <button
                type="button"
                class="commodity-pill"
                data-home-commodity="${escapeAttribute(commodity)}"
              >
                <span class="commodity-pill-icon" aria-hidden="true">${escapeHtml(getCommodityIcon(commodity, activeCategory.id))}</span>
                <span class="commodity-pill-label">${escapeHtml(translateEntity("commodity", commodity))}</span>
              </button>
            `).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function getResultsIntroCopy() {
    if (getActiveResultsLayout() === "table") {
      return getUiText("results_intro_table");
    }
    return getUiText("results_intro_cards");
  }

  function renderResultsLayoutToggle() {
    if (state.route.view !== "table") {
      return "";
    }

    const activeLayout = getActiveResultsLayout();
    return `
      <div class="results-layout-toggle" role="group" aria-label="${escapeAttribute(getUiText("results_layout_aria", "Results layout"))}">
        <button type="button" class="results-layout-button ${activeLayout === "cards" ? "is-active" : ""}" data-results-layout="cards" aria-pressed="${activeLayout === "cards" ? "true" : "false"}">${escapeHtml(getUiText("layout_cards", "Cards"))}</button>
        <button type="button" class="results-layout-button ${activeLayout === "table" ? "is-active" : ""}" data-results-layout="table" aria-pressed="${activeLayout === "table" ? "true" : "false"}">${escapeHtml(getUiText("layout_table", "Table"))}</button>
      </div>
    `;
  }

  function renderLocaleToggle() {
    return `
      <div class="locale-toggle" role="group" aria-label="${escapeAttribute(getUiText("language_aria", "Language"))}">
        <button type="button" class="locale-toggle-button ${state.locale === "en" ? "is-active" : ""}" data-locale-toggle="en">${escapeHtml(getUiText("language_english", "English"))}</button>
        <button type="button" class="locale-toggle-button ${state.locale === "kn" ? "is-active" : ""}" data-locale-toggle="kn">${escapeHtml(getUiText("language_kannada", "Kannada"))}</button>
      </div>
    `;
  }

  function renderTopBar() {
    return `
      <div class="shell-top-inner">
        <div class="shell-top-left">
          ${state.route.view === "table" ? `<button type="button" class="back-button shell-home-button" id="backHome">${escapeHtml(getUiText("home_button"))}</button>` : ""}
        </div>
        ${renderLocaleToggle()}
      </div>
    `;
  }

  function renderMapPanel() {
    return `
      <div class="map-widget">
        <div class="map-controls">
          <button type="button" class="map-control-button" data-map-zoom="in" aria-label="${escapeAttribute(getUiText("zoom_in_aria", "Zoom in"))}">+</button>
          <button type="button" class="map-control-button" data-map-zoom="out" aria-label="${escapeAttribute(getUiText("zoom_out_aria", "Zoom out"))}">-</button>
          <button type="button" class="map-control-button map-control-reset" data-map-reset="true">${escapeHtml(getUiText("reset", "Reset"))}</button>
        </div>
        <div class="map-placeholder map-viewer" data-map-viewport="true">
          <div class="map-canvas" data-map-canvas="true">
            ${state.mapSvgMarkup || `<p>${escapeHtml(getUiText("map_loading"))}</p>`}
          </div>
        </div>
        ${renderActiveDistrictPanel()}
      </div>
    `;
  }

  function renderActiveDistrictPanel() {
    const district = getActiveMapDistrict();
    if (!district) {
      return `
        <div class="map-district-panel">
          <strong>${escapeHtml(getUiText("district_empty_title"))}</strong>
        </div>
      `;
    }

    const marketButtons = district.markets.length
      ? district.markets.map((entry) => `
          <button type="button" class="market-chip" data-map-market="${escapeAttribute(entry.market)}">${escapeHtml(translateEntity("market", entry.market))}</button>
        `).join("")
      : `<p class="muted">${escapeHtml(getUiText("no_mapped_markets", "No mapped markets are available for this district in the current dataset."))}</p>`;

    return `
      <div class="map-district-panel">
        <strong>${escapeHtml(district.district)}</strong>
        <p>${escapeHtml(formatMarketCountLabel(district.markets.length))}</p>
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

  function syncSearchSuggestionsUi() {
    document.querySelectorAll("[data-search-suggestions]").forEach((node) => {
      node.innerHTML = state.suggestions.length ? renderSuggestions() : "";
    });

    bindSuggestionEvents();
  }

  function getSuggestionLabel(result) {
    if (result.type === "commodity") {
      return `${translateEntity("commodity", result.commodity)} (${getUiText("field_commodity", "Commodity")})`;
    }
    if (result.type === "market") {
      return `${translateEntity("market", result.market)} (${getUiText("field_market", "Market")})`;
    }
    return `${translateEntity("variety", result.variety)} (${translateEntity("commodity", result.commodity)})`;
  }

  function getSuggestionMeta(result) {
    if (result.type === "commodity") {
      return getUiText("suggestion_meta_commodity", "Opens commodity results");
    }
    if (result.type === "market") {
      return getUiText("suggestion_meta_market", "Opens market results");
    }
    return getUiText("suggestion_meta_variety", "Opens variety results");
  }

  function getActiveHomeCategory() {
    if (!state.categoryGroups.length) {
      return null;
    }
    return state.categoryGroups.find((category) => category.id === state.activeHomeCategoryId) || state.categoryGroups[0];
  }

  function getCategoryLabel(categoryId, fallbackLabel) {
    return getUiText(`category_${categoryId}`, fallbackLabel || categoryId);
  }

  function getCategoryIcon(categoryId) {
    return CATEGORY_ICONS[categoryId] || "🧺";
  }

  function getCommodityIcon(commodity, categoryId) {
    return COMMODITY_ICONS[commodity] || getCategoryIcon(categoryId);
  }

  function formatCountLabel(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function formatMarketCountLabel(count) {
    return `${count} ${getUiText(count === 1 ? "market_label_singular" : "market_label_plural", count === 1 ? "market" : "markets")} ${getUiText("mapped_to_this_district", "mapped to this district.")}`;
  }

  function handleHomeCategorySelect(categoryId) {
    if (!categoryId || categoryId === state.activeHomeCategoryId) {
      return;
    }
    state.activeHomeCategoryId = categoryId;
    state.shouldRevealActiveHomeCategory = true;
    scheduleRender();
  }

  function handleHomeCommoditySelect(commodity) {
    navigate({
      view: "table",
      layout: "cards",
      type: "commodity",
      commodity,
      market: "",
      variety: "",
    });
  }

  function renderFilterLauncher() {
    if (!state.context || !state.context.filters.length) {
      return "";
    }

    return `
      <button type="button" class="filter-fab ${state.showFilterHint ? "is-expanded is-highlighted" : ""}" data-open-filter-modal="true" aria-label="${escapeAttribute(getUiText("filter_open_aria", "Open filters"))}">
        <span class="filter-fab-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16l-6 7v5l-4 2v-7z" fill="currentColor"></path>
          </svg>
        </span>
        <span class="filter-fab-label">${escapeHtml(getUiText("filter_fab_label", "Use filters here"))}</span>
      </button>
    `;
  }

  function renderFilterModal() {
    if (!state.context || !state.context.filters.length || !state.isFilterModalOpen) {
      return "";
    }

    return `
      <div class="filter-modal-backdrop" data-close-filter-modal="backdrop">
        <section class="filter-modal panel" role="dialog" aria-modal="true" aria-label="${escapeAttribute(getUiText("filters_label", "Filters"))}">
          <div class="filter-modal-head">
            <div>
              <p class="search-label">${escapeHtml(getUiText("filters_label", "Filters"))}</p>
              <h3>${escapeHtml(getUiText("refine_results", "Refine results"))}</h3>
            </div>
            <button type="button" class="filter-modal-close" data-close-filter-modal="button" aria-label="${escapeAttribute(getUiText("close_filters_aria", "Close filters"))}">&times;</button>
          </div>
          <div class="filter-modal-body" data-preserve-scroll-id="filter-modal-body">
            ${state.context.filters.map((field) => renderFilterField(field)).join("")}
          </div>
          <div class="filter-modal-actions">
            <button type="button" class="inline-button filter-clear-inline" data-clear-filter-drafts="true">${escapeHtml(getUiText("clear_filters", "Clear Filters"))}</button>
            <button type="button" class="clear-button filter-apply-button" data-apply-filter-drafts="true">${escapeHtml(getUiText("apply_filters", "Apply Filters"))}</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderFilterField(field) {
    const selected = state.filterDrafts[field] || [];
    const query = state.filterSearches[field] || "";
    const options = getDraftFilterOptions(field, query);
    const isOpen = state.activeFilterField === field;

    return `
      <div class="filter-modal-group">
        <label>${escapeHtml(`${getFieldLabel(field)} ${getUiText("filter_suffix", "filter")}`)}</label>
        <div class="filter-multiselect">
          <div class="filter-chip-row">
            ${selected.length ? selected.map((value) => `
              <span class="filter-chip">
                <span>${escapeHtml(translateEntity(field, value))}</span>
                <button type="button" class="filter-chip-remove" data-remove-draft-filter="${field}" data-remove-draft-value="${escapeAttribute(value)}" aria-label="${escapeAttribute(`${getUiText("remove_value_prefix", "Remove")} ${translateEntity(field, value)}`)}">&times;</button>
              </span>
            `).join("") : `<span class="filter-chip-placeholder">${escapeHtml(getAllLabel(field))}</span>`}
          </div>
          <input
            type="text"
            class="filter-search-input"
            placeholder="${escapeAttribute(getUiText("type_to_search", "Type to search"))}"
            value="${escapeAttribute(query)}"
            data-filter-search="${field}"
          >
          <div class="filter-search-results ${isOpen ? "is-open" : ""}" data-preserve-scroll-id="filter-search-results" data-filter-results="${field}" data-filter-field="${field}">
            ${isOpen ? (options.length ? options.map((value) => `
              <button
                type="button"
                class="filter-search-option ${selected.includes(value) ? "is-selected" : ""}"
                data-toggle-draft-filter="${field}"
                data-toggle-draft-value="${escapeAttribute(value)}"
              >
                <span>${escapeHtml(translateEntity(field, value))}</span>
                ${selected.includes(value) ? `<span class="filter-option-check">&#10003;</span>` : ""}
              </button>
            `).join("") : `<p class="muted filter-empty-note">${escapeHtml(getUiText("no_matching_options", "No matching options."))}</p>`) : ""}
          </div>
        </div>
      </div>
    `;
  }

  function renderFilterOptionsMarkup(field) {
    const selected = state.filterDrafts[field] || [];
    const query = state.filterSearches[field] || "";
    const options = getDraftFilterOptions(field, query);

    if (!options.length) {
      return `<p class="muted filter-empty-note">${escapeHtml(getUiText("no_matching_options", "No matching options."))}</p>`;
    }

    return options.map((value) => `
      <button
        type="button"
        class="filter-search-option ${selected.includes(value) ? "is-selected" : ""}"
        data-toggle-draft-filter="${field}"
        data-toggle-draft-value="${escapeAttribute(value)}"
      >
        <span>${escapeHtml(translateEntity(field, value))}</span>
        ${selected.includes(value) ? `<span class="filter-option-check">&#10003;</span>` : ""}
      </button>
    `).join("");
  }

  function syncFilterFieldUi(field) {
    const resultsNode = document.querySelector(`[data-filter-results="${field}"]`);
    if (!resultsNode) {
      return;
    }

    document.querySelectorAll("[data-filter-results]").forEach((node) => {
      node.classList.toggle("is-open", node.dataset.filterResults === state.activeFilterField);
    });

    if (state.activeFilterField === field) {
      resultsNode.innerHTML = renderFilterOptionsMarkup(field);
      bindDraftFilterToggleEvents(resultsNode);
    } else {
      resultsNode.innerHTML = "";
    }
  }

  function syncAllFilterFieldUis() {
    document.querySelectorAll("[data-filter-results]").forEach((node) => {
      const field = node.dataset.filterResults;
      if (!field) {
        return;
      }
      if (field === state.activeFilterField) {
        node.classList.add("is-open");
        node.innerHTML = renderFilterOptionsMarkup(field);
        bindDraftFilterToggleEvents(node);
      } else {
        node.classList.remove("is-open");
        node.innerHTML = "";
      }
    });
  }

  function renderResults(rows) {
    if (!state.context) {
      return `<div class="empty-state">${escapeHtml(getUiText("loading_rows", "Loading rows..."))}</div>`;
    }

    if (!rows.length) {
      return `<div class="empty-state">${escapeHtml(getUiText("no_rows_match", "No rows match the current combination. The filter options stay constrained to valid combinations only, so clearing filters should broaden the result set."))}</div>`;
    }

    if (getActiveResultsLayout() === "table") {
      return renderResultsTable(rows);
    }

    return renderResultsCards(rows);
  }

  function renderResultsCards(rows) {
    return `
      <div class="results-list">
        ${rows.map((row) => renderResultCard(row)).join("")}
      </div>
    `;
  }

  function renderResultsTable(rows) {
    const columns = getTableColumns();
    return `
      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              ${renderResultsTableHeaderCells(columns)}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => renderResultRow(row, columns)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderStickyTableHeader(rows) {
    if (!rows.length) {
      return "";
    }

    const columns = getTableColumns();
    return `
      <div class="results-sticky-header" data-sticky-table-header="true" aria-hidden="true" hidden>
        <div class="results-sticky-header-viewport" data-sticky-table-header-viewport="true">
          <table class="results-table results-table-sticky" data-sticky-table-header-table="true">
            <thead>
              <tr>
                ${renderResultsTableHeaderCells(columns)}
              </tr>
            </thead>
          </table>
        </div>
      </div>
    `;
  }

  function renderResultsTableHeaderCells(columns) {
    return `
      ${columns.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
      <th>${escapeHtml(getUiText("arrivals_units_header", "Arrivals & Units"))}</th>
      <th>${escapeHtml(getUiText("max_price_rs", "Max Price (Rs.)"))}</th>
      <th>${escapeHtml(getUiText("min_price_rs", "Min Price (Rs.)"))}</th>
      <th>${escapeHtml(getUiText("modal_price_rs", "Modal Price (Rs.)"))}</th>
      <th>${escapeHtml(getUiText("latest_update", "Latest Update"))}</th>
      <th>${escapeHtml(getUiText("previous_update", "Previous Update"))}</th>
    `;
  }

  function getTableColumns() {
    const type = state.context ? state.context.type : "";
    const fixed = 6;

    if (type === "market") {
      return {
        headers: [getUiText("field_commodity", "Commodity"), getUiText("field_variety", "Variety"), getUiText("field_grade", "Grade")],
        getCells: (row) => [
          `<td class="result-col-primary">${escapeHtml(translateEntity("commodity", row.commodity))}</td>`,
          `<td>${escapeHtml(translateEntity("variety", row.variety))}</td>`,
          `<td>${escapeHtml(row.grade)}</td>`,
        ],
        count: 3 + fixed,
      };
    }

    if (type === "commodity") {
      return {
        headers: [getUiText("field_market", "Market"), getUiText("field_variety", "Variety"), getUiText("field_grade", "Grade")],
        getCells: (row) => [
          `<td class="result-col-primary">${escapeHtml(translateEntity("market", row.market))}</td>`,
          `<td>${escapeHtml(translateEntity("variety", row.variety))}</td>`,
          `<td>${escapeHtml(row.grade)}</td>`,
        ],
        count: 3 + fixed,
      };
    }

    if (type === "variety") {
      return {
        headers: [getUiText("field_market", "Market"), getUiText("field_grade", "Grade")],
        getCells: (row) => [
          `<td class="result-col-primary">${escapeHtml(translateEntity("market", row.market))}</td>`,
          `<td>${escapeHtml(row.grade)}</td>`,
        ],
        count: 2 + fixed,
      };
    }

    return {
      headers: [getUiText("field_market", "Market"), getUiText("field_variety", "Variety"), getUiText("field_grade", "Grade")],
      getCells: (row) => [
        `<td class="result-col-primary">${escapeHtml(translateEntity("market", row.market))}</td>`,
        `<td>${escapeHtml(translateEntity("variety", row.variety))}</td>`,
        `<td>${escapeHtml(row.grade)}</td>`,
      ],
      count: 3 + fixed,
    };
  }

  function getCardPresentation(row) {
    const type = state.context ? state.context.type : "";

    if (type === "market") {
      return {
        titleLabel: getUiText("field_commodity", "Commodity"),
        titleValue: translateEntity("commodity", row.commodity),
        meta: [
          { label: getUiText("field_variety", "Variety"), value: translateEntity("variety", row.variety) },
          { label: getUiText("field_grade", "Grade"), value: row.grade },
        ],
      };
    }

    if (type === "commodity") {
      return {
        titleLabel: getUiText("field_market", "Market"),
        titleValue: translateEntity("market", row.market),
        meta: [
          { label: getUiText("field_variety", "Variety"), value: translateEntity("variety", row.variety) },
          { label: getUiText("field_grade", "Grade"), value: row.grade },
        ],
      };
    }

    if (type === "variety") {
      return {
        titleLabel: getUiText("field_market", "Market"),
        titleValue: translateEntity("market", row.market),
        meta: [
          { label: getUiText("field_variety", "Variety"), value: translateEntity("variety", row.variety) },
          { label: getUiText("field_grade", "Grade"), value: row.grade },
        ],
      };
    }

    return {
      titleLabel: getUiText("field_market", "Market"),
      titleValue: translateEntity("market", row.market),
      meta: [
        { label: getUiText("field_commodity", "Commodity"), value: translateEntity("commodity", row.commodity) },
        { label: getUiText("field_variety", "Variety"), value: translateEntity("variety", row.variety) },
        { label: getUiText("field_grade", "Grade"), value: row.grade },
      ],
    };
  }

  function renderResultCard(row) {
    const isExpanded = row.rowKey === state.expandedRowKey;
    const historyRows = isExpanded ? getHistoryRows(row) : [];
    const presentation = getCardPresentation(row);
    const previousRow = getPreviousComparableRow(row);
    return `
      <article class="result-card ${isExpanded ? "is-expanded" : ""}" data-row-key="${escapeAttribute(row.rowKey)}">
        <div class="result-card-main">
          <section class="result-card-identity">
            <div class="result-card-title-row">
              <h3>${escapeHtml(presentation.titleValue)}</h3>
            </div>
            <div class="result-card-meta">
              ${presentation.meta.map((entry) => `
                <div class="result-meta-item">
                  <span class="result-meta-label">${escapeHtml(entry.label)}</span>
                  <span class="result-meta-value">${escapeHtml(entry.value)}</span>
                </div>
              `).join("")}
            </div>
          </section>

          <section class="result-card-prices">
            ${renderPriceGroup("max", getUiText("max_price_rs", "Max Price (Rs.)"), row.maxPrice, getPreviousPriceDelta(row, "maxPrice", previousRow))}
            ${renderPriceGroup("min", getUiText("min_price_rs", "Min Price (Rs.)"), row.minPrice, getPreviousPriceDelta(row, "minPrice", previousRow))}
            ${renderPriceGroup("modal", getUiText("modal_price_rs", "Modal Price (Rs.)"), row.modalPrice, getPreviousPriceDelta(row, "modalPrice", previousRow))}
          </section>

          <section class="result-card-details">
            <div class="result-detail-block">
              <span class="result-detail-label">${escapeHtml(getUiText("arrivals_and_units", "Arrivals And Units"))}</span>
              <span class="result-detail-value">${escapeHtml(`${formatNumber(row.arrivals)} ${row.unit}`)}</span>
            </div>
            <div class="result-detail-block">
              <span class="result-detail-label">${escapeHtml(getUiText("price_updates", "Price Updates"))}</span>
              <div class="date-stack">
                <div class="date-stack-item">
                  <span class="date-stack-label">${escapeHtml(getUiText("latest", "Latest"))}</span>
                  <span>${escapeHtml(formatDateFull(row.reportDate))}</span>
                </div>
                <div class="date-stack-item">
                  <span class="date-stack-label">${escapeHtml(getUiText("previous", "Previous"))}</span>
                  <span>${escapeHtml(previousRow ? formatDateFull(previousRow.reportDate) : "-")}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <button type="button" class="result-card-toggle" data-toggle-history="${escapeAttribute(row.rowKey)}" aria-expanded="${isExpanded ? "true" : "false"}">
          <span class="result-card-toggle-label">${escapeHtml(getUiText("see_price_history", "See Price History"))}</span>
          <span class="result-card-toggle-chevron">${isExpanded ? "&#9652;" : "&#9662;"}</span>
        </button>

        ${isExpanded ? `
          <div class="result-card-history">
            ${renderHistory(row, historyRows)}
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderResultRow(row, columns) {
    const isExpanded = row.rowKey === state.expandedRowKey;
    const historyRows = isExpanded ? getHistoryRows(row) : [];
    const previousRow = getPreviousComparableRow(row);
    return `
      <tr class="result-row ${isExpanded ? "is-expanded" : ""}" data-toggle-history="${escapeAttribute(row.rowKey)}">
        ${columns.getCells(row).join("")}
        <td>${escapeHtml(`${formatNumber(row.arrivals)} ${row.unit}`)}</td>
        <td class="result-col-price">
          <span class="price-value price-value-max">${formatCurrency(row.maxPrice)}</span>
          ${renderPriceDelta(getPreviousPriceDelta(row, "maxPrice", previousRow))}
        </td>
        <td class="result-col-price">
          <span class="price-value price-value-min">${formatCurrency(row.minPrice)}</span>
          ${renderPriceDelta(getPreviousPriceDelta(row, "minPrice", previousRow))}
        </td>
        <td class="result-col-price">
          <span class="price-value price-value-modal">${formatCurrency(row.modalPrice)}</span>
          ${renderPriceDelta(getPreviousPriceDelta(row, "modalPrice", previousRow))}
        </td>
        <td>${escapeHtml(formatDateFull(row.reportDate))}</td>
        <td>${escapeHtml(previousRow ? formatDateFull(previousRow.reportDate) : "-")}</td>
      </tr>
      ${isExpanded ? `
        <tr class="result-row-chart">
          <td colspan="${columns.count}" class="result-row-chart-cell">
            <div class="result-card-history">
              ${renderHistory(row, historyRows)}
            </div>
          </td>
        </tr>
      ` : ""}
    `;
  }

  function renderPriceGroup(kind, label, value, delta) {
    return `
      <div class="result-price-group result-price-group-${escapeAttribute(kind)}">
        <span class="result-price-label">${escapeHtml(label)}</span>
        <div class="price-stack">
          <span class="price-value price-value-${escapeAttribute(kind)}">${formatCurrency(value)}</span>
          ${renderPriceDelta(delta)}
        </div>
      </div>
    `;
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
      return `<span class="price-delta price-delta-flat">${escapeHtml(getUiText("no_earlier_update", "No earlier update"))}</span>`;
    }

    if (delta === 0) {
      return `
        <span class="price-delta price-delta-flat">
          <span class="delta-flat">-</span>
          <span>0</span>
        </span>
      `;
    }

    const isGain = delta > 0;
    return `
      <span class="price-delta ${isGain ? "price-delta-gain" : "price-delta-loss"}">
        ${renderDeltaIcon(isGain)}
        <span>${isGain ? "+" : "-"}${formatCurrency(Math.abs(delta))}</span>
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
    const activePoint = getActiveHistoryPoint(historyRows);
    return `
      <section class="history-card">
        <div class="chart-shell">
          <p class="chart-scroll-note">${escapeHtml(getUiText("chart_scroll_note", "<-- Scroll horizontally to see all dates -->"))}</p>
          <div class="history-layout">
            <div class="history-chart-panel">
              ${renderChart(historyRows, activePoint, row.rowKey)}
            </div>
            <div class="chart-summary-shell">
              ${renderChartSummary(activePoint)}
            </div>
            <div class="axis-note">${escapeHtml(getUiText("trend_note", "Trend is shown for this exact commodity, market, variety, and grade combination."))}</div>
          </div>
        </div>
        <div class="history-collapse-wrap">
          <button type="button" class="history-collapse-button" data-close-history="${escapeAttribute(row.rowKey)}" aria-label="${escapeAttribute(getUiText("collapse_price_history_aria", "Collapse price history"))}">
            <span class="history-collapse-arrow">&#9652;</span>
          </button>
        </div>
      </section>
    `;
  }

  function renderChart(rows, activePoint, rowKey) {
    if (!rows.length) {
      return `<p class="muted">${escapeHtml(getUiText("no_historical_points", "No historical points are available inside the required time window."))}</p>`;
    }

    if (rows.length === 1) {
      const point = rows[0];
      return `
        <div class="footer-note">
          ${escapeHtml(getUiText("only_one_price_point_prefix", "Only one price point is available on"))} ${escapeHtml(formatDateFull(point.reportDate))}.
          ${escapeHtml(getUiText("min_short", "Min"))}: ${formatCurrency(point.minPrice)},
          ${escapeHtml(getUiText("max_short", "Max"))}: ${formatCurrency(point.maxPrice)},
          ${escapeHtml(getUiText("modal_short", "Modal"))}: ${formatCurrency(point.modalPrice)}.
        </div>
      `;
    }

    const axisWidth = 25;
    const width = Math.max(700, 120 + (rows.length - 1) * 96);
    const height = 320;
    const paddingX = 38;
    const paddingTop = 18;
    const paddingBottom = 44;
    const values = rows.flatMap((row) => [row.minPrice, row.maxPrice, row.modalPrice]);
    const chartScale = buildChartScale(values);
    const xStep = (width - paddingX * 2) / Math.max(rows.length - 1, 1);

    const toX = (index) => paddingX + xStep * index;
    const toY = (value) => {
      const normalized = value / chartScale.maxTick;
      return height - paddingBottom - normalized * (height - paddingTop - paddingBottom);
    };

    const minPath = buildLinePath(rows.map((row, index) => [toX(index), toY(row.minPrice)]));
    const maxPath = buildLinePath(rows.map((row, index) => [toX(index), toY(row.maxPrice)]));
    const modalPath = buildLinePath(rows.map((row, index) => [toX(index), toY(row.modalPrice)]));
    const activeIndex = rows.findIndex((row) => row.reportDate === activePoint.reportDate);
    const activeX = toX(activeIndex);
    const labels = rows.map((row, index) => `
      <text x="${toX(index)}" y="${height - 12}" text-anchor="middle" fill="#5b6654" font-size="12">${escapeHtml(formatDateShort(row.reportDate))}</text>
    `).join("");

    const yAxisTicks = chartScale.ticks.map((tick) => {
      const y = toY(tick);
      return `
        <g>
          <line x1="${axisWidth - 8}" y1="${y}" x2="${axisWidth}" y2="${y}" stroke="#c2c8da" stroke-width="1.5" />
          <text x="${axisWidth - 22}" y="${y + 14}" text-anchor="middle" fill="#5b6654" font-size="11" transform="rotate(-90 ${axisWidth - 22} ${y})">${escapeHtml(formatCurrency(tick))}</text>
        </g>
      `;
    }).join("");

    const gridLines = chartScale.ticks.map((tick) => {
      const y = toY(tick);
      return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="${tick === 0 ? "#cfd5e3" : "#e8ebf3"}" stroke-width="${tick === 0 ? "1.6" : "1"}" />`;
    }).join("");

    const pointTargets = rows.map((row, index) => {
      const x = toX(index);
      const maxY = toY(row.maxPrice);
      const minY = toY(row.minPrice);
      const modalY = toY(row.modalPrice);
      const isActive = row.reportDate === activePoint.reportDate;
      return `
        <g data-chart-date="${escapeAttribute(row.reportDate)}" class="chart-point-group ${isActive ? "is-active" : ""}">
          <line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${height - paddingBottom}" stroke="${isActive ? "#adb7d8" : "transparent"}" stroke-dasharray="5 5" />
          ${renderChartPointCircle(x, maxY, PRICE_COLORS.max, isActive)}
          ${renderChartPointCircle(x, minY, PRICE_COLORS.min, isActive)}
          ${renderChartPointCircle(x, modalY, PRICE_COLORS.modal, isActive)}
          <rect x="${x - 20}" y="${paddingTop}" width="40" height="${height - paddingTop - paddingBottom}" fill="transparent" />
        </g>
      `;
    }).join("");

    return `
      <div class="chart-layout">
        <div class="chart-axis-y" aria-hidden="true">
          <svg viewBox="0 0 ${axisWidth} ${height}" width="${axisWidth}" height="${height}">
            <line x1="${axisWidth}" y1="${paddingTop}" x2="${axisWidth}" y2="${height - paddingBottom}" stroke="#d5d8e6" />
            <line x1="${axisWidth - 1}" y1="${height - paddingBottom}" x2="${axisWidth}" y2="${height - paddingBottom}" stroke="#cfd5e3" stroke-width="1.6" />
            ${yAxisTicks}
          </svg>
        </div>
        <div
          class="chart-scroll"
          data-preserve-scroll-id="chart-scroll"
          data-chart-row-key="${escapeAttribute(rowKey)}"
          data-chart-initial-position="right"
          data-chart-active-x="${activeX}"
          data-chart-x-step="${xStep}"
          data-chart-point-count="${rows.length}"
        >
          <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeAttribute(getUiText("price_history_aria", "Price history"))}" data-chart-root="true">
            ${gridLines}
            <path d="${minPath}" fill="none" stroke="${PRICE_COLORS.min}" stroke-width="3" />
            <path d="${modalPath}" fill="none" stroke="${PRICE_COLORS.modal}" stroke-width="3" stroke-dasharray="10 6" />
            <path d="${maxPath}" fill="none" stroke="${PRICE_COLORS.max}" stroke-width="3.5" />
            ${pointTargets}
            ${labels}
          </svg>
        </div>
      </div>
    `;
  }

  function renderChartSummary(activePoint) {
    if (!activePoint) {
      return "";
    }

    return `
      <div class="chart-summary">
        <div class="chart-summary-date">
          <span class="chart-summary-date-label">${escapeHtml(getUiText("selected_date", "Selected Date"))}</span>
          <strong class="chart-summary-date-value">${escapeHtml(formatDateFull(activePoint.reportDate))}</strong>
        </div>
        <div class="chart-summary-metrics">
          <span class="chart-metric chart-metric-max chart-metric-slot-max">
            <span class="chart-metric-label"><span class="chart-metric-line chart-metric-line-max"></span>${escapeHtml(getUiText("max_short", "Max"))}</span>
            <span class="chart-metric-value">${formatCurrency(activePoint.maxPrice)}</span>
          </span>
          <span class="chart-metric chart-metric-min chart-metric-slot-min">
            <span class="chart-metric-label"><span class="chart-metric-line chart-metric-line-min"></span>${escapeHtml(getUiText("min_short", "Min"))}</span>
            <span class="chart-metric-value">${formatCurrency(activePoint.minPrice)}</span>
          </span>
          <span class="chart-metric chart-metric-modal chart-metric-slot-modal">
            <span class="chart-metric-label"><span class="chart-metric-line chart-metric-line-modal"></span>${escapeHtml(getUiText("modal_short", "Modal"))}</span>
            <span class="chart-metric-value">${formatCurrency(activePoint.modalPrice)}</span>
          </span>
        </div>
      </div>
    `;
  }

  function renderChartPointCircle(x, y, color, isActive) {
    return `<circle cx="${x}" cy="${y}" r="${isActive ? 7 : 5.5}" fill="${isActive ? color : "#fffaf6"}" stroke="${color}" stroke-width="2.5" />`;
  }

  function buildChartScale(values) {
    const maxValue = Math.max(...values, 0);
    const tickCount = 4;
    const rawStep = maxValue / tickCount || 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    let niceNormalized = 1;

    if (normalized > 5) {
      niceNormalized = 10;
    } else if (normalized > 2) {
      niceNormalized = 5;
    } else if (normalized > 1) {
      niceNormalized = 2;
    }

    const step = Math.max(1, niceNormalized * magnitude);
    const maxTick = Math.max(step, Math.ceil(maxValue / step) * step);
    const ticks = [];
    for (let tick = 0; tick <= maxTick; tick += step) {
      ticks.push(tick);
    }

    if (ticks[ticks.length - 1] !== maxTick) {
      ticks.push(maxTick);
    }

    return { step, maxTick, ticks };
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
    const backHome = document.getElementById("backHome");
    if (backHome) {
      const handleBackHome = (event) => {
        event.stopPropagation();
        handleHomeClick();
      };

      backHome.addEventListener("pointerdown", handleBackHome);
      backHome.addEventListener("click", handleBackHome);
    }

    document.querySelectorAll("[data-global-search]").forEach((input) => {
      input.addEventListener("input", handleSearchInput);
    });

    document.querySelectorAll("[data-locale-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        setLocale(button.dataset.localeToggle);
      });
    });

    document.querySelectorAll("[data-home-category]").forEach((button) => {
      button.addEventListener("click", () => {
        handleHomeCategorySelect(button.dataset.homeCategory);
      });
    });

    document.querySelectorAll("[data-home-commodity]").forEach((button) => {
      button.addEventListener("click", () => {
        handleHomeCommoditySelect(button.dataset.homeCommodity);
      });
    });

    document.querySelectorAll("[data-results-layout]").forEach((button) => {
      button.addEventListener("click", () => {
        setResultsLayout(button.dataset.resultsLayout);
      });
    });

    bindSuggestionEvents();

    document.querySelectorAll("[data-open-filter-modal]").forEach((button) => {
      button.addEventListener("click", openFilterModal);
    });

    document.querySelectorAll("[data-close-filter-modal]").forEach((node) => {
      node.addEventListener("click", (event) => {
        const mode = node.dataset.closeFilterModal;
        if (mode === "backdrop" && event.target !== node) {
          return;
        }
        closeFilterModal();
      });
    });

    document.querySelectorAll("[data-filter-search]").forEach((input) => {
      input.addEventListener("focus", () => {
        activateFilterField(input.dataset.filterSearch);
        scheduleFilterFieldIntoView(input);
      });
      input.addEventListener("input", () => {
        updateFilterSearch(
          input.dataset.filterSearch,
          input.value,
          input.selectionStart,
          input.selectionEnd
        );
      });
    });

    bindDraftFilterToggleEvents(document);

    document.querySelectorAll("[data-remove-draft-filter]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        removeDraftFilterValue(button.dataset.removeDraftFilter, button.dataset.removeDraftValue);
      });
    });

    document.querySelectorAll("[data-apply-filter-drafts]").forEach((button) => {
      button.addEventListener("click", applyFilterDrafts);
    });

    document.querySelectorAll("[data-clear-filter-drafts]").forEach((button) => {
      button.addEventListener("click", clearFilterDrafts);
    });

    document.querySelectorAll("[data-toggle-history]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const key = button.dataset.toggleHistory;
        if (state.expandedRowKey === key) {
          state.expandedRowKey = null;
          state.activeChartDate = null;
          state.shouldPrimeExpandedHistory = false;
        } else {
          state.expandedRowKey = key;
          state.activeChartDate = null;
          state.shouldPrimeExpandedHistory = getActiveResultsLayout() === "table";
        }
        render();
      });
    });

    document.querySelectorAll("[data-close-history]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.expandedRowKey = null;
        state.activeChartDate = null;
        state.shouldPrimeExpandedHistory = false;
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

  function bindSuggestionEvents() {
    document.querySelectorAll("[data-suggestion-index]").forEach((button) => {
      if (button.dataset.boundSuggestionClick === "true") {
        return;
      }

      button.dataset.boundSuggestionClick = "true";
      button.addEventListener("click", () => {
        const result = state.suggestions[Number(button.dataset.suggestionIndex)];
        if (result) {
          handleSuggestionSelect(result);
        }
      });
    });
  }

  function bindDraftFilterToggleEvents(root) {
    root.querySelectorAll("[data-toggle-draft-filter]").forEach((button) => {
      if (button.dataset.boundToggleDraftFilter === "true") {
        return;
      }

      button.dataset.boundToggleDraftFilter = "true";
      button.addEventListener("click", () => {
        toggleDraftFilterValue(button.dataset.toggleDraftFilter, button.dataset.toggleDraftValue);
      });
    });
  }

  function setupVisualViewportTracking() {
    updateVisualViewportHeight();
    syncExpandedHistoryLayout();

    if (!window.visualViewport) {
      window.addEventListener("resize", () => {
        updateVisualViewportHeight();
        updateTableWrapHeight();
        syncExpandedHistoryLayout();
      });
      return;
    }

    window.visualViewport.addEventListener("resize", handleVisualViewportChange);
    window.visualViewport.addEventListener("scroll", handleVisualViewportChange);
    window.addEventListener("resize", () => {
      updateVisualViewportHeight();
      updateTableWrapHeight();
      syncExpandedHistoryLayout();
    });
  }

  function handleVisualViewportChange() {
    updateVisualViewportHeight();
    updateTableWrapHeight();
    syncExpandedHistoryLayout();

    if (!state.isFilterModalOpen) {
      return;
    }

    const activeInput = document.activeElement;
    if (activeInput && activeInput.matches("[data-filter-search]")) {
      scheduleFilterFieldIntoView(activeInput);
    }
  }

  function updateVisualViewportHeight() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--visual-viewport-height", `${Math.round(height)}px`);
  }

  function scheduleFilterFieldIntoView(input) {
    if (!input) {
      return;
    }

    window.setTimeout(() => {
      const field = input.closest(".filter-modal-group");
      if (field) {
        field.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }, 80);
  }

  function primeTableArrivalUi() {
    state.shouldScrollTableIntoView = true;
    state.showFilterHint = true;
    clearFilterHintTimers();
  }

  function clearFilterHintTimers() {
    if (filterHintTimer !== null) {
      window.clearTimeout(filterHintTimer);
      filterHintTimer = null;
    }
    if (filterHintFinalizeTimer !== null) {
      window.clearTimeout(filterHintFinalizeTimer);
      filterHintFinalizeTimer = null;
    }
  }

  function runPostRenderEffects() {
    updateTableWrapHeight();
    syncFilterHintAnimation();
    syncActiveHomeCategoryViewport();
    if (getActiveResultsLayout() === "table") {
      syncStickyTableHeader();
      primeExpandedHistoryScroll();
    }
    syncExpandedHistoryLayout();

    if (state.shouldScrollTableIntoView && state.route.view === "table" && state.context) {
      const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
      if (tableWrap) {
        tableWrap.scrollIntoView({ block: "start" });
        state.shouldScrollTableIntoView = false;
        updateTableWrapHeight();
      }
    }
  }

  function syncActiveHomeCategoryViewport() {
    if (state.route.view !== "home" || !state.shouldRevealActiveHomeCategory) {
      return;
    }

    const activeCategory = document.querySelector("[data-home-category].is-active");
    if (activeCategory && typeof activeCategory.scrollIntoView === "function") {
      activeCategory.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }

    state.shouldRevealActiveHomeCategory = false;
  }

  function syncFilterHintAnimation() {
    const button = document.querySelector("[data-open-filter-modal]");
    if (!button) {
      clearFilterHintTimers();
      return;
    }

    if (!state.showFilterHint) {
      button.classList.remove("is-expanded", "is-highlighted", "is-collapsing");
      clearFilterHintTimers();
      return;
    }

    button.classList.add("is-expanded", "is-highlighted");
    button.classList.remove("is-collapsing");

    if (filterHintTimer !== null || filterHintFinalizeTimer !== null) {
      return;
    }

    filterHintTimer = window.setTimeout(() => {
      const liveButton = document.querySelector("[data-open-filter-modal]");
      if (liveButton) {
        liveButton.classList.remove("is-highlighted");
        liveButton.classList.add("is-collapsing");
        liveButton.classList.remove("is-expanded");
      }

      filterHintTimer = null;
      filterHintFinalizeTimer = window.setTimeout(() => {
        state.showFilterHint = false;
        filterHintFinalizeTimer = null;
        render();
      }, FILTER_HINT_COLLAPSE_MS);
    }, FILTER_HINT_DURATION_MS);
  }

  function updateTableWrapHeight() {
    const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
    if (!tableWrap) {
      return;
    }

    if (getActiveResultsLayout() === "table" || window.innerWidth > 720) {
      tableWrap.style.removeProperty("--table-wrap-height");
      return;
    }

    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const top = tableWrap.getBoundingClientRect().top;
    const available = Math.max(240, Math.floor(viewportHeight - top - 12));
    tableWrap.style.setProperty("--table-wrap-height", `${available}px`);
  }

  function primeExpandedHistoryScroll() {
    if (!state.shouldPrimeExpandedHistory || !state.expandedRowKey || getActiveResultsLayout() !== "table") {
      return;
    }

    const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
    const tableScroller = tableWrap ? tableWrap.querySelector(".results-table-wrap") : null;
    const chartScroll = document.querySelector("[data-preserve-scroll-id='chart-scroll']");

    window.requestAnimationFrame(() => {
      if (tableScroller) {
        tableScroller.scrollLeft = getAnchoredScrollLeft(tableScroller, 0.82, 120);
      }

      if (chartScroll && chartScroll.dataset.chartInitialPosition === "right") {
        chartScroll.scrollLeft = getChartAnchoredScrollLeft(chartScroll);
      }

      state.shouldPrimeExpandedHistory = false;
      syncExpandedHistoryLayout();
    });
  }

  function getAnchoredScrollLeft(scroller, anchorRatio, contextWidth) {
    if (!scroller) {
      return 0;
    }

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    if (maxScrollLeft === 0) {
      return 0;
    }

    const desiredVisibleEnd = Math.max(scroller.clientWidth, scroller.scrollWidth - contextWidth);
    const target = desiredVisibleEnd - scroller.clientWidth * anchorRatio;
    return Math.max(0, Math.min(maxScrollLeft, Math.round(target)));
  }

  function getChartAnchoredScrollLeft(chartScroll) {
    if (!chartScroll) {
      return 0;
    }

    const maxScrollLeft = Math.max(0, chartScroll.scrollWidth - chartScroll.clientWidth);
    if (maxScrollLeft === 0) {
      return 0;
    }

    const activeX = Number(chartScroll.dataset.chartActiveX || 0);
    const xStep = Number(chartScroll.dataset.chartXStep || 0);
    const pointCount = Number(chartScroll.dataset.chartPointCount || 0);
    const anchorRatio = window.innerWidth <= 720 ? 0.8 : 0.84;
    const baseTarget = activeX - chartScroll.clientWidth * anchorRatio;
    const contextOffset = pointCount > 1 ? xStep * 1.2 : 0;
    const target = baseTarget - contextOffset;
    return Math.max(0, Math.min(maxScrollLeft, Math.round(target)));
  }

  function syncExpandedHistoryLayout() {
    const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
    const tableScroller = tableWrap ? tableWrap.querySelector(".results-table-wrap") : null;

    document.querySelectorAll(".history-layout").forEach((layout) => {
      const summaryShell = layout.querySelector(".chart-summary-shell");
      const chartPanel = layout.querySelector(".history-chart-panel");
      const chartSummary = summaryShell ? summaryShell.querySelector(".chart-summary") : null;

      if (!summaryShell || !chartPanel || !chartSummary) {
        return;
      }

      const availableWidth = tableScroller
        ? Math.floor(tableScroller.getBoundingClientRect().width)
        : Math.floor(layout.getBoundingClientRect().width);

      let layoutMode = "mobile";
      if (window.innerWidth > 720) {
        layoutMode = availableWidth >= 1180 ? "wide" : "compact";
      }

      layout.dataset.chartSummaryLayout = layoutMode;
      summaryShell.dataset.chartSummaryLayout = layoutMode;
      chartSummary.dataset.chartSummaryLayout = layoutMode;

      if (layoutMode === "mobile") {
        const mobileWidth = Math.max(220, availableWidth - 12);
        summaryShell.style.width = `${mobileWidth}px`;
        summaryShell.style.maxWidth = `${mobileWidth}px`;
      } else {
        summaryShell.style.removeProperty("width");
        summaryShell.style.removeProperty("max-width");
      }
    });
  }

  function syncStickyTableHeader() {
    teardownStickyTableHeader();

    const tableWrap = document.querySelector("[data-preserve-scroll-id='table-wrap']");
    const tableScroller = tableWrap ? tableWrap.querySelector(".results-table-wrap") : null;
    const table = tableWrap ? tableWrap.querySelector(".results-table") : null;
    const overlay = document.querySelector("[data-sticky-table-header='true']");
    const overlayTable = overlay ? overlay.querySelector("[data-sticky-table-header-table='true']") : null;

    if (!tableWrap || !tableScroller || !table || !overlay || !overlayTable) {
      return;
    }

    const liveHeaders = [...table.querySelectorAll("thead th")];
    const stickyHeaders = [...overlayTable.querySelectorAll("thead th")];

    if (!liveHeaders.length || liveHeaders.length !== stickyHeaders.length) {
      return;
    }

    let syncFrameId = 0;

    const scheduleSync = () => {
      if (syncFrameId) {
        return;
      }

      syncFrameId = window.requestAnimationFrame(() => {
        syncFrameId = 0;
        applyStickyTableHeaderLayout();
      });
    };

    const applyStickyTableHeaderLayout = () => {
      const tableRect = table.getBoundingClientRect();
      const headerRow = table.querySelector("thead tr");
      const wrapRect = tableScroller.getBoundingClientRect();

      if (!headerRow) {
        overlay.hidden = true;
        overlay.classList.remove("is-visible");
        return;
      }

      const headerRect = headerRow.getBoundingClientRect();
      const overlayHeight = Math.ceil(headerRect.height);
      const isVisible = headerRect.top <= 0
        && tableRect.bottom > overlayHeight
        && wrapRect.bottom > overlayHeight
        && wrapRect.width > 0;

      overlay.hidden = !isVisible;
      overlay.classList.toggle("is-visible", isVisible);

      if (!isVisible) {
        return;
      }

      overlay.style.left = `${Math.round(wrapRect.left)}px`;
      overlay.style.width = `${Math.round(wrapRect.width)}px`;
      overlay.style.top = "0px";

      const liveTableWidth = Math.ceil(table.getBoundingClientRect().width);
      overlayTable.style.width = `${liveTableWidth}px`;
      overlayTable.style.transform = `translateX(${-tableScroller.scrollLeft}px)`;

      liveHeaders.forEach((headerCell, index) => {
        const width = Math.ceil(headerCell.getBoundingClientRect().width);
        stickyHeaders[index].style.width = `${width}px`;
        stickyHeaders[index].style.minWidth = `${width}px`;
        stickyHeaders[index].style.maxWidth = `${width}px`;
      });
    };

    const handleScroll = () => {
      scheduleSync();
    };

    const handleResize = () => {
      scheduleSync();
    };

    tableScroller.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("scroll", handleScroll, { passive: true });
      window.visualViewport.addEventListener("resize", handleResize);
    }

    scheduleSync();

    stickyTableHeaderCleanup = () => {
      tableScroller.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener("scroll", handleScroll);
        window.visualViewport.removeEventListener("resize", handleResize);
      }

      if (syncFrameId) {
        window.cancelAnimationFrame(syncFrameId);
        syncFrameId = 0;
      }

      overlay.hidden = true;
      overlay.classList.remove("is-visible");
      overlay.removeAttribute("style");
      overlayTable.removeAttribute("style");
      stickyHeaders.forEach((cell) => {
        cell.style.removeProperty("width");
        cell.style.removeProperty("min-width");
        cell.style.removeProperty("max-width");
      });
    };
  }

  function teardownStickyTableHeader() {
    if (!stickyTableHeaderCleanup) {
      return;
    }

    stickyTableHeaderCleanup();
    stickyTableHeaderCleanup = null;
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

    renderDistrictLabels(rootSvg, pathLookup);
    renderActiveDistrictOutline(rootSvg, pathLookup);
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
    path.style.stroke = "#fff7f2";
    path.style.strokeWidth = "1.4";
    path.style.opacity = isActive ? "1" : "0.94";
  }

  function renderDistrictLabels(rootSvg, pathLookup) {
    const existingLayer = rootSvg.querySelector("#district-label-layer");
    if (existingLayer) {
      existingLayer.remove();
    }

    if (state.activeMapDistrictSlug) {
      return;
    }

    const labelLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelLayer.setAttribute("id", "district-label-layer");
    labelLayer.setAttribute("class", "district-label-layer");

    state.mapDistricts.forEach((district) => {
      const pathNode = pathLookup.get(district.districtSlug);
      if (!pathNode) {
        return;
      }

      const bounds = pathNode.getBBox();
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(bounds.x + (bounds.width / 2)));
      text.setAttribute("y", String(bounds.y + (bounds.height / 2)));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "district-map-label");
      text.textContent = district.district;
      labelLayer.appendChild(text);
    });

    rootSvg.appendChild(labelLayer);
  }

  function renderActiveDistrictOutline(rootSvg, pathLookup) {
    const existingOutline = rootSvg.querySelector("#district-active-outline");
    if (existingOutline) {
      existingOutline.remove();
    }

    const district = getActiveMapDistrict();
    if (!district) {
      return;
    }

    const pathNode = pathLookup.get(district.districtSlug);
    if (!pathNode) {
      return;
    }

    const outline = pathNode.cloneNode(false);
    outline.setAttribute("id", "district-active-outline");
    outline.setAttribute("class", "district-active-outline");
    outline.removeAttribute("data-district-slug");
    outline.style.fill = "none";
    outline.style.pointerEvents = "none";
    rootSvg.appendChild(outline);
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
    marker.setAttribute("aria-label", `${getUiText("open_market_results_prefix", "Open")} ${marketName} ${getUiText("open_market_results_suffix", "market results")}`);
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

      const target = event.target;
      const isInteractiveTarget = Boolean(
        target
        && typeof target.closest === "function"
        && target.closest(".map-region, .market-marker")
      );

      if (event.button !== 0 || !isMapZoomedIn() || isInteractiveTarget) {
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
      return getUiText("all_varieties", "All varieties");
    }
    if (field === "commodity") {
      return getUiText("all_commodities", "All commodities");
    }
    if (field === "market") {
      return getUiText("all_markets", "All markets");
    }
    return `${getUiText("all_fallback_prefix", "All")} ${field}`;
  }

  function getUiText(key, fallback) {
    const entry = (state.translations.ui || {})[key];
    if (!entry) {
      return fallback || key;
    }
    if (state.locale === "kn" && entry.kn) {
      return entry.kn;
    }
    return entry.en || fallback || key;
  }

  function getFieldLabel(field) {
    return getUiText(`field_${field}`, capitalize(field));
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
    scheduleRender();
  }

  function scheduleSearchInputWork(query) {
    if (searchInputTimer !== null) {
      window.clearTimeout(searchInputTimer);
    }

    if (!query.trim()) {
      search(query);
      return;
    }

    searchInputTimer = window.setTimeout(() => {
      searchInputTimer = null;
      search(query);
    }, SEARCH_INPUT_DEBOUNCE_MS);
  }

  function scheduleRender() {
    if (renderFrameId !== null) {
      return;
    }

    renderFrameId = window.requestAnimationFrame(() => {
      renderFrameId = null;
      render();
    });
  }

  function invalidateDerivedDataCaches() {
    state.cachedVisibleRowsKey = "";
    state.cachedVisibleRows = [];
    state.cachedFilterOptions = {};
  }

  function buildVisibleRowsCacheKey() {
    if (!state.context) {
      return "";
    }

    return [
      state.route.type,
      state.route.commodity,
      state.route.market,
      state.route.variety,
      state.baseRows.length,
      serializeFilters(state.filters),
    ].join("::");
  }

  function serializeFilters(filters) {
    return Object.keys(filters)
      .sort()
      .map((key) => `${key}:${(filters[key] || []).slice().sort().join("|")}`)
      .join(";");
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

