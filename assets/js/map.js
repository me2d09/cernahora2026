(function () {
  "use strict";

  const dataElement = document.getElementById("map-data");
  const mapElement = document.getElementById("trip-map");
  const listElement = document.getElementById("waypoint-list");
  const countElement = document.getElementById("waypoint-count");
  const errorElement = document.getElementById("map-error");
  const routePointsElement = document.getElementById("route-points");
  const routeStatusElement = document.getElementById("route-status");
  const routeCalculateButton = document.getElementById("route-calculate");
  const routeSwapButton = document.getElementById("route-swap");
  const routeClearButton = document.getElementById("route-clear");
  const directRouteLegendElement = document.getElementById(
    "direct-route-legend"
  );
  const directRouteLegendItemsElement = document.getElementById(
    "direct-route-legend-items"
  );

  if (!dataElement || !mapElement || !listElement) {
    return;
  }

  let tripData;

  try {
    tripData = JSON.parse(dataElement.textContent);
  } catch (error) {
    showMapError();
    return;
  }

  const waypoints = Array.isArray(tripData.waypoints)
    ? tripData.waypoints
        .filter(isValidWaypoint)
        .sort((first, second) => (first.order || 0) - (second.order || 0))
    : [];
  const waypointsById = new Map(
    waypoints.map(function (waypoint) {
      return [waypoint.id, waypoint];
    })
  );
  const directRoutes = Array.isArray(tripData.directRoutes)
    ? tripData.directRoutes
    : [];
  const MAX_ROUTE_POINTS = 5;
  const ROUTING_ATTRIBUTION =
    '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener noreferrer">Routing: Seznam.cz a.s. and others</a>';

  const state = {
    activeGroups: new Set(),
    activeProvider: null,
    baseLayers: {},
    directRoutes: {
      legendItems: new Map(),
      layers: [],
      loadedCount: 0
    },
    map: null,
    mapyLogoControl: null,
    markers: new Map(),
    route: {
      abortController: null,
      attributionAdded: false,
      error: null,
      layer: null,
      loading: false,
      result: null,
      selectedIds: []
    },
    routingProvider: null,
    selectedId: null
  };

  renderWaypointList(getVisibleWaypoints());
  updateFilterCounts();
  bindFilters();
  bindRoutePlanner();
  renderRoutePlanner();

  if (typeof window.L === "undefined") {
    showMapError();
    return;
  }

  initializeMap();

  function initializeMap() {
    const defaults = tripData.mapDefaults || {};
    const defaultCenter = defaults.center || {};
    const center = [
      Number(defaultCenter.lat) || 44.2,
      Number(defaultCenter.lon) || 18.6
    ];

    state.map = L.map(mapElement, {
      center,
      zoom: Number(defaults.zoom) || 6,
      zoomControl: false,
      scrollWheelZoom: false
    });

    L.control.zoom({ position: "topright" }).addTo(state.map);
    state.baseLayers = createBaseLayers();
    state.routingProvider = createRoutingProvider();
    createRoutePanes();
    bindProviderSwitch();
    setMapProvider(getInitialProvider());
    addVisibleMarkers(getVisibleWaypoints());
    fitVisibleMarkers();
    loadDirectRoutes();

    state.map.on("click", clearSelection);
    state.map.on("focus", function () {
      state.map.scrollWheelZoom.enable();
    });
    state.map.on("blur", function () {
      state.map.scrollWheelZoom.disable();
    });
  }

  function createRoutePanes() {
    const directRoutesPane = state.map.createPane("directRoutesPane");
    directRoutesPane.style.zIndex = "350";
    directRoutesPane.style.pointerEvents = "none";

    const plannedRoutePane = state.map.createPane("plannedRoutePane");
    plannedRoutePane.style.zIndex = "410";
    plannedRoutePane.style.pointerEvents = "none";
  }

  function loadDirectRoutes() {
    renderDirectRouteLegend();

    if (directRoutes.length === 0) {
      return;
    }

    if (!state.routingProvider) {
      directRoutes.forEach(function (route) {
        updateDirectRouteLegend(route, "error");
      });
      return;
    }

    const endpoints = getDirectRouteEndpoints();
    if (!endpoints) {
      directRoutes.forEach(function (route) {
        updateDirectRouteLegend(route, "error");
      });
      return;
    }

    directRoutes.forEach(function (route) {
      loadDirectRoute(route, endpoints);
    });
  }

  async function loadDirectRoute(route, endpoints) {
    if (!isValidDirectRoute(route)) {
      updateDirectRouteLegend(route, "error");
      return;
    }

    const routeWaypoints = [
      endpoints.start
    ].concat(
      route.via.filter(isValidDirectRoutePoint).map(function (point) {
        return {
          position: {
            lat: Number(point.lat),
            lon: Number(point.lon)
          }
        };
      }),
      [endpoints.destination]
    );

    try {
      const result = await state.routingProvider.calculate(routeWaypoints);
      const layer = L.geoJSON(result.geometry, {
        pane: "directRoutesPane",
        style: {
          color: getDirectRouteColor(route),
          lineCap: "round",
          lineJoin: "round",
          opacity: 0.58,
          weight: 5
        }
      }).addTo(state.map);

      state.directRoutes.layers.push(layer);
      state.directRoutes.loadedCount = state.directRoutes.layers.length;
      updateDirectRouteLegend(route, "ready", result.duration);
      updateRoutingAttribution();
      updateMapyLogo();
    } catch (error) {
      updateDirectRouteLegend(route, "error");
    }
  }

  function getDirectRouteEndpoints() {
    const destinationId =
      tripData.trip &&
      tripData.trip.destination &&
      tripData.trip.destination.waypoint_id;
    const start = waypoints.find(function (waypoint) {
      return (
        waypoint.status === "fixed" &&
        waypoint.presentation &&
        waypoint.presentation.category === "start"
      );
    });
    const destination = destinationId && waypointsById.get(destinationId);

    return start && destination ? { start, destination } : null;
  }

  function isValidDirectRoute(route) {
    return (
      route &&
      typeof route.id === "string" &&
      typeof route.name === "string" &&
      Array.isArray(route.via)
    );
  }

  function isValidDirectRoutePoint(point) {
    const latitude = Number(point && point.lat);
    const longitude = Number(point && point.lon);

    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    );
  }

  function getDirectRouteColor(route) {
    return /^#[0-9a-f]{6}$/i.test(route && route.color)
      ? route.color
      : "#215c45";
  }

  function renderDirectRouteLegend() {
    if (!directRouteLegendElement || !directRouteLegendItemsElement) {
      return;
    }

    directRouteLegendElement.hidden = directRoutes.length === 0;
    directRouteLegendItemsElement.replaceChildren();
    state.directRoutes.legendItems.clear();

    directRoutes.forEach(function (route) {
      const item = createElement("div", "direct-route-legend-item is-loading");
      item.title = route.description || route.name || "Trasa do XIO";
      const swatch = createElement("i", "direct-route-swatch");
      swatch.style.backgroundColor = getDirectRouteColor(route);
      item.appendChild(swatch);

      const copy = createElement("span", "direct-route-legend-copy");
      copy.appendChild(
        createElement("strong", "", route.name || "Trasa do XIO")
      );
      copy.appendChild(createElement("small", "", "Načítám trasu…"));
      item.appendChild(copy);

      directRouteLegendItemsElement.appendChild(item);
      if (route && typeof route.id === "string") {
        state.directRoutes.legendItems.set(route.id, item);
      }
    });
  }

  function updateDirectRouteLegend(route, status, duration) {
    const item =
      route &&
      typeof route.id === "string" &&
      state.directRoutes.legendItems.get(route.id);

    if (!item) {
      return;
    }

    item.classList.toggle("is-loading", status === "loading");
    item.classList.toggle("is-error", status === "error");

    const statusElement = item.querySelector("small");
    if (!statusElement) {
      return;
    }

    if (status === "error") {
      statusElement.textContent = "Trasu se nepodařilo načíst.";
      return;
    }

    statusElement.textContent = Number.isFinite(Number(duration))
      ? formatRouteDuration(duration) + " autem"
      : "Doba jízdy není dostupná.";
  }

  function createRoutingProvider() {
    const apiKey = tripData.mapConfig && tripData.mapConfig.mapyApiKey;

    if (!apiKey || typeof window.MapyRoutingProvider === "undefined") {
      return null;
    }

    return new window.MapyRoutingProvider(apiKey);
  }

  function createBaseLayers() {
    const config = tripData.mapConfig || {};
    const layers = {
      openstreetmap: L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
        }
      )
    };

    if (config.mapyApiKey) {
      const mapset = config.mapyMapset || "outdoor";
      const tileUrl =
        "https://api.mapy.com/v1/maptiles/" +
        encodeURIComponent(mapset) +
        "/256/{z}/{x}/{y}?apikey=" +
        encodeURIComponent(config.mapyApiKey) +
        "&lang=cs";

      layers.mapy = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution:
          '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener noreferrer">Seznam.cz a.s. and others</a>'
      });
    }

    return layers;
  }

  function getInitialProvider() {
    const configuredProvider =
      (tripData.mapConfig && tripData.mapConfig.provider) || "openstreetmap";

    return state.baseLayers[configuredProvider]
      ? configuredProvider
      : "openstreetmap";
  }

  function bindProviderSwitch() {
    document.querySelectorAll("[data-map-provider]").forEach(function (button) {
      const provider = button.dataset.mapProvider;

      if (!state.baseLayers[provider]) {
        button.disabled = true;
        button.title = "Tento mapový podklad není nakonfigurovaný.";
        return;
      }

      button.addEventListener("click", function () {
        setMapProvider(provider);
      });
    });
  }

  function setMapProvider(provider) {
    const nextLayer = state.baseLayers[provider];
    if (!nextLayer || state.activeProvider === provider) {
      return;
    }

    if (state.activeProvider && state.baseLayers[state.activeProvider]) {
      state.map.removeLayer(state.baseLayers[state.activeProvider]);
    }

    nextLayer.addTo(state.map);
    state.activeProvider = provider;
    updateProviderButtons();
    updateMapyLogo();
  }

  function updateProviderButtons() {
    document.querySelectorAll("[data-map-provider]").forEach(function (button) {
      const isActive = button.dataset.mapProvider === state.activeProvider;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function updateMapyLogo() {
    const shouldShowLogo =
      state.activeProvider === "mapy" ||
      Boolean(state.route.layer) ||
      state.directRoutes.loadedCount > 0;

    if (shouldShowLogo) {
      if (!state.mapyLogoControl) {
        state.mapyLogoControl = createMapyLogoControl();
      }
      if (!state.mapyLogoControl._map) {
        state.map.addControl(state.mapyLogoControl);
      }
      return;
    }

    if (state.mapyLogoControl && state.mapyLogoControl._map) {
      state.map.removeControl(state.mapyLogoControl);
    }
  }

  function createMapyLogoControl() {
    const MapyLogoControl = L.Control.extend({
      options: {
        position: "bottomleft"
      },
      onAdd: function () {
        const link = createElement("a", "mapy-logo");
        link.href = "https://mapy.com/";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", "Mapy.com");

        const logo = createElement("img", "");
        logo.src = "https://api.mapy.com/img/api/logo.svg";
        logo.alt = "Mapy.com";
        link.appendChild(logo);
        return link;
      }
    });

    return new MapyLogoControl();
  }

  function addVisibleMarkers(visibleWaypoints) {
    visibleWaypoints.forEach(function (waypoint) {
      const icon = createMarkerIcon(waypoint);
      const marker = L.marker(
        [waypoint.position.lat, waypoint.position.lon],
        {
          icon,
          keyboard: true,
          title: waypoint.short_name || waypoint.name,
          alt: waypoint.short_name || waypoint.name
        }
      );

      marker.bindPopup(createPopup(waypoint), {
        maxWidth: 320,
        minWidth: 260,
        autoPanPadding: [28, 28]
      });
      marker.on("click", function () {
        selectWaypoint(waypoint.id, false);
      });
      marker.addTo(state.map);
      state.markers.set(waypoint.id, marker);
    });
  }

  function createMarkerIcon(waypoint) {
    const iconDefinition = getIconDefinition(waypoint);
    const routePosition = state.route.selectedIds.indexOf(waypoint.id);
    const markerContent =
      routePosition >= 0
        ? '<strong class="trip-marker-route-label">' +
          getRoutePointLabel(routePosition) +
          "</strong>"
        : '<span aria-hidden="true">' +
          escapeHtml(iconDefinition.emoji || "•") +
          "</span>";
    const markerHtml =
      '<div class="trip-marker" style="--marker-color:' +
      sanitizeColor(iconDefinition.color) +
      '">' +
      markerContent +
      "</div>";

    return L.divIcon({
      className: "",
      html: markerHtml,
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -31]
    });
  }

  function createPopup(waypoint) {
    const card = createElement("article", "popup-card");
    const featuredPhoto = getFeaturedPhoto(waypoint);

    if (featuredPhoto) {
      const photoWrap = createElement("div", "popup-photo-wrap");
      const photo = createElement("img", "popup-photo");
      photo.src = featuredPhoto.url;
      photo.alt = featuredPhoto.caption || "";
      photo.loading = "lazy";
      photo.referrerPolicy = "no-referrer";
      photo.addEventListener("error", function () {
        photoWrap.remove();
      });
      photoWrap.appendChild(photo);

      if (featuredPhoto.source_page) {
        const credit = createElement("a", "popup-photo-credit", "Foto / licence");
        credit.href = featuredPhoto.source_page;
        credit.target = "_blank";
        credit.rel = "noopener noreferrer";
        photoWrap.appendChild(credit);
      }

      card.appendChild(photoWrap);
    }

    const body = createElement("div", "popup-body");
    const meta = createElement("div", "popup-meta");
    meta.appendChild(
      createElement("span", "popup-badge", getRouteLabel(waypoint.route_group))
    );
    meta.appendChild(
      createElement(
        "span",
        "popup-badge popup-badge--status",
        getStatusLabel(waypoint.status)
      )
    );
    body.appendChild(meta);

    body.appendChild(
      createElement("h3", "popup-title", waypoint.short_name || waypoint.name)
    );

    if (waypoint.summary) {
      body.appendChild(createElement("p", "popup-summary", waypoint.summary));
    }

    const stats = createElement("div", "popup-stats");
    stats.appendChild(
      createStat("Wow efekt", formatScore(waypoint.ratings && waypoint.ratings.wow))
    );
    stats.appendChild(
      createStat("Pro děti", formatScore(waypoint.ratings && waypoint.ratings.kids))
    );
    stats.appendChild(
      createStat("Návštěva", formatDuration(waypoint.visit))
    );
    body.appendChild(stats);

    const actions = createElement("div", "popup-actions");
    const routeIndex = state.route.selectedIds.indexOf(waypoint.id);
    const addToRouteButton = createElement(
      "button",
      "popup-link popup-link--primary",
      routeIndex >= 0
        ? "V trase jako " + getRoutePointLabel(routeIndex)
        : state.route.selectedIds.length >= MAX_ROUTE_POINTS
          ? "Trasa už má pět bodů"
          : "Přidat do trasy"
    );
    addToRouteButton.type = "button";
    addToRouteButton.disabled =
      routeIndex >= 0 || state.route.selectedIds.length >= MAX_ROUTE_POINTS;
    addToRouteButton.addEventListener("click", function () {
      addWaypointToRoute(waypoint.id);
      state.map.closePopup();
    });
    actions.appendChild(addToRouteButton);
    actions.appendChild(
      createLink(
        "Všechny detaily",
        getWaypointUrl(waypoint.id),
        "popup-link popup-link--detail",
        false
      )
    );
    if (waypoint.links && waypoint.links.openstreetmap) {
      actions.appendChild(
        createLink(
          "Otevřít mapu",
          waypoint.links.openstreetmap,
          "popup-link",
          true
        )
      );
    }
    body.appendChild(actions);
    card.appendChild(body);

    return card;
  }

  function renderWaypointList(visibleWaypoints) {
    listElement.replaceChildren();
    countElement.textContent = visibleWaypoints.length + " míst";

    if (visibleWaypoints.length === 0) {
      listElement.appendChild(
        createElement("p", "empty-state", "V této skupině zatím nejsou žádná místa.")
      );
      return;
    }

    visibleWaypoints.forEach(function (waypoint) {
      const button = createElement("button", "waypoint-item");
      button.type = "button";
      button.dataset.waypointId = waypoint.id;
      button.setAttribute(
        "aria-label",
        "Zobrazit místo " + (waypoint.short_name || waypoint.name) + " na mapě"
      );

      const iconDefinition = getIconDefinition(waypoint);
      const symbol = createElement(
        "span",
        "waypoint-symbol",
        iconDefinition.emoji || "•"
      );
      symbol.style.setProperty("--marker-color", sanitizeColor(iconDefinition.color));
      symbol.setAttribute("aria-hidden", "true");

      const copy = createElement("span", "waypoint-copy");
      copy.appendChild(
        createElement("strong", "", waypoint.short_name || waypoint.name)
      );
      copy.appendChild(
        createElement(
          "span",
          "",
          [
            waypoint.location && waypoint.location.country,
            getStatusLabel(waypoint.status)
          ]
            .filter(Boolean)
            .join(" · ")
        )
      );

      const score = createElement("span", "waypoint-score");
      const scoreValue = waypoint.ratings && waypoint.ratings.route_fit;
      const strongScore = createElement(
        "strong",
        "",
        Number.isFinite(Number(scoreValue)) ? scoreValue : "–"
      );
      score.appendChild(strongScore);
      score.appendChild(document.createTextNode("/5"));

      button.append(symbol, copy, score);
      button.addEventListener("click", function () {
        selectWaypoint(waypoint.id, true);
      });
      listElement.appendChild(button);
    });
  }

  function bindFilters() {
    document.querySelectorAll("[data-route-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        const routeGroup = button.dataset.routeFilter;
        const shouldEnable = !state.activeGroups.has(routeGroup);

        if (shouldEnable) {
          state.activeGroups.add(routeGroup);
        } else {
          state.activeGroups.delete(routeGroup);
        }

        button.classList.toggle("is-active", shouldEnable);
        button.setAttribute("aria-pressed", String(shouldEnable));

        const visibleWaypoints = getVisibleWaypoints();
        clearSelection();
        renderWaypointList(visibleWaypoints);

        if (state.map) {
          state.markers.forEach(function (marker) {
            marker.remove();
          });
          state.markers.clear();
          addVisibleMarkers(visibleWaypoints);

          const groupWaypoints = getOptionalWaypoints(routeGroup);
          if (shouldEnable && groupWaypoints.length > 0) {
            fitWaypoints(groupWaypoints);
          } else {
            const visibleOptionalWaypoints = visibleWaypoints.filter(
              function (waypoint) {
                return !isFixedWaypoint(waypoint);
              }
            );
            fitWaypoints(
              visibleOptionalWaypoints.length > 0
                ? visibleOptionalWaypoints
                : getFixedWaypoints()
            );
          }
        }
      });
    });
  }

  function updateFilterCounts() {
    document.querySelectorAll("[data-filter-count]").forEach(function (element) {
      const count = getOptionalWaypoints(element.dataset.filterCount).length;
      const button = element.closest("[data-route-filter]");
      element.textContent = count;

      if (button) {
        button.disabled = count === 0;
        if (count === 0) {
          button.title = "V této kategorii zatím nejsou žádná místa.";
        }
      }
    });
  }

  function bindRoutePlanner() {
    if (
      !routePointsElement ||
      !routeCalculateButton ||
      !routeSwapButton ||
      !routeClearButton
    ) {
      return;
    }

    routeCalculateButton.addEventListener("click", calculateRoute);
    routeSwapButton.addEventListener("click", swapRoutePoints);
    routeClearButton.addEventListener("click", clearRoute);
  }

  function addWaypointToRoute(waypointId) {
    if (
      state.route.selectedIds.includes(waypointId) ||
      state.route.selectedIds.length >= MAX_ROUTE_POINTS
    ) {
      return;
    }

    clearRouteResult();
    state.route.selectedIds.push(waypointId);
    state.route.error = null;
    renderRoutePlanner();
    syncRoutePresentation();
  }

  function removeWaypointFromRoute(waypointId) {
    clearRouteResult();
    state.route.selectedIds = state.route.selectedIds.filter(function (id) {
      return id !== waypointId;
    });
    state.route.error = null;
    renderRoutePlanner();
    syncRoutePresentation();
  }

  function swapRoutePoints() {
    if (state.route.selectedIds.length < 2) {
      return;
    }

    clearRouteResult();
    state.route.selectedIds.reverse();
    state.route.error = null;
    renderRoutePlanner();
    syncRoutePresentation();
  }

  function clearRoute() {
    clearRouteResult();
    state.route.selectedIds = [];
    state.route.error = null;
    renderRoutePlanner();
    syncRoutePresentation();
  }

  async function calculateRoute() {
    if (
      state.route.selectedIds.length < 2 ||
      !state.routingProvider ||
      state.route.loading
    ) {
      if (!state.routingProvider) {
        state.route.error = "Routing přes Mapy.com není nakonfigurovaný.";
        renderRoutePlanner();
      }
      return;
    }

    clearRouteResult();
    const routeWaypoints = state.route.selectedIds.map(function (waypointId) {
      return waypointsById.get(waypointId);
    });

    if (routeWaypoints.some(function (waypoint) { return !waypoint; })) {
      state.route.error = "Vybrané body už nejsou dostupné.";
      renderRoutePlanner();
      return;
    }

    state.route.abortController = new AbortController();
    state.route.loading = true;
    state.route.error = null;
    renderRoutePlanner();

    try {
      const result = await state.routingProvider.calculate(routeWaypoints, {
        signal: state.route.abortController.signal
      });

      state.route.result = result;
      state.route.layer = L.geoJSON(result.geometry, {
        pane: "plannedRoutePane",
        style: {
          color: "#d95f2b",
          opacity: 0.92,
          weight: 6
        }
      }).addTo(state.map);

      updateRoutingAttribution();
      updateMapyLogo();
      state.map.fitBounds(state.route.layer.getBounds(), {
        padding: [45, 45],
        maxZoom: 12
      });
    } catch (error) {
      if (error.name !== "AbortError") {
        state.route.error = translateRoutingError(error);
      }
    } finally {
      state.route.loading = false;
      state.route.abortController = null;
      renderRoutePlanner();
    }
  }

  function clearRouteResult() {
    if (state.route.abortController) {
      state.route.abortController.abort();
      state.route.abortController = null;
    }

    if (state.route.layer && state.map) {
      state.map.removeLayer(state.route.layer);
      state.route.layer = null;
    }

    state.route.loading = false;
    state.route.result = null;
    updateRoutingAttribution();
    updateMapyLogo();
  }

  function updateRoutingAttribution() {
    if (!state.map) {
      return;
    }

    const shouldShowAttribution =
      Boolean(state.route.layer) || state.directRoutes.loadedCount > 0;

    if (shouldShowAttribution && !state.route.attributionAdded) {
      state.map.attributionControl.addAttribution(ROUTING_ATTRIBUTION);
      state.route.attributionAdded = true;
      return;
    }

    if (!shouldShowAttribution && state.route.attributionAdded) {
      state.map.attributionControl.removeAttribution(ROUTING_ATTRIBUTION);
      state.route.attributionAdded = false;
    }
  }

  function renderRoutePlanner() {
    if (
      !routePointsElement ||
      !routeStatusElement ||
      !routeCalculateButton ||
      !routeSwapButton ||
      !routeClearButton
    ) {
      return;
    }

    routePointsElement.replaceChildren();
    Array.from({ length: MAX_ROUTE_POINTS }).forEach(function (_, index) {
      const label = getRoutePointLabel(index);
      const waypointId = state.route.selectedIds[index];
      const waypoint = waypointId && waypointsById.get(waypointId);
      const slot = createElement(
        "div",
        "route-point" + (waypoint ? " is-filled" : "")
      );
      slot.appendChild(createElement("span", "route-point-label", label));

      const copy = createElement("span", "route-point-copy");
      copy.appendChild(
        createElement(
          "strong",
          "",
          waypoint
            ? waypoint.short_name || waypoint.name
            : index === 0
              ? "Vyber začátek"
              : "Další bod (volitelný)"
        )
      );
      copy.appendChild(
        createElement(
          "span",
          "",
          waypoint && waypoint.location
            ? waypoint.location.country
            : "Přes kartu bodu na mapě"
        )
      );
      slot.appendChild(copy);

      if (waypoint) {
        const removeButton = createElement(
          "button",
          "route-point-remove",
          "×"
        );
        removeButton.type = "button";
        removeButton.setAttribute(
          "aria-label",
          "Odebrat " + (waypoint.short_name || waypoint.name) + " z trasy"
        );
        removeButton.addEventListener("click", function () {
          removeWaypointFromRoute(waypoint.id);
        });
        slot.appendChild(removeButton);
      }

      routePointsElement.appendChild(slot);
    });

    const hasEnoughPoints = state.route.selectedIds.length >= 2;
    routeCalculateButton.disabled =
      !hasEnoughPoints || state.route.loading || !state.routingProvider;
    routeCalculateButton.textContent = state.route.loading
      ? "Počítám…"
      : "Spočítat trasu";
    routeSwapButton.disabled = !hasEnoughPoints || state.route.loading;
    routeClearButton.disabled =
      state.route.selectedIds.length === 0 && !state.route.layer;

    routeStatusElement.classList.toggle(
      "is-error",
      Boolean(state.route.error)
    );
    routeStatusElement.classList.toggle(
      "is-result",
      Boolean(state.route.result)
    );

    if (state.route.loading) {
      routeStatusElement.textContent = "Mapy.com hledají nejrychlejší trasu autem…";
    } else if (state.route.error) {
      routeStatusElement.textContent = state.route.error;
    } else if (state.route.result) {
      routeStatusElement.textContent =
        formatRouteDistance(state.route.result.length) +
        " · přibližně " +
        formatRouteDuration(state.route.result.duration) +
        " autem";
    } else if (hasEnoughPoints) {
      routeStatusElement.textContent =
        formatRoutePointCount(state.route.selectedIds.length) +
        " jsou připravené. Teď můžeš spočítat trasu.";
    } else {
      routeStatusElement.textContent =
        "Přidej alespoň dva body z jejich karty na mapě (maximálně pět).";
    }
  }

  function syncRoutePresentation() {
    const visibleWaypoints = getVisibleWaypoints();
    const visibleIds = new Set(
      visibleWaypoints.map(function (waypoint) {
        return waypoint.id;
      })
    );

    renderWaypointList(visibleWaypoints);

    state.markers.forEach(function (marker, waypointId) {
      if (!visibleIds.has(waypointId)) {
        marker.remove();
        state.markers.delete(waypointId);
      }
    });

    visibleWaypoints.forEach(function (waypoint) {
      if (!state.markers.has(waypoint.id)) {
        addVisibleMarkers([waypoint]);
      }
    });

    state.markers.forEach(function (marker, waypointId) {
      const waypoint = waypointsById.get(waypointId);
      if (!waypoint) {
        return;
      }

      marker.setIcon(createMarkerIcon(waypoint));
      marker.setPopupContent(createPopup(waypoint));
    });
  }

  function translateRoutingError(error) {
    const messages = {
      "Mapy.com API key is not configured.":
        "Routing přes Mapy.com není nakonfigurovaný.",
      "Routing is not available for the configured Mapy.com API key.":
        "API klíč nemá povolené routování přes Mapy.com.",
      "A drivable route between these points could not be found.":
        "Mezi vybranými body se nepodařilo najít trasu autem.",
      "The selected points cannot be used for route planning.":
        "Vybrané body nelze použít pro plánování trasy.",
      "Mapy.com returned an incomplete route.":
        "Mapy.com vrátily neúplnou trasu."
    };

    return messages[error.message] || "Trasu se nepodařilo spočítat. Zkus to znovu.";
  }

  function formatRouteDistance(meters) {
    const kilometers = Number(meters) / 1000;
    return new Intl.NumberFormat("cs-CZ", {
      maximumFractionDigits: kilometers < 100 ? 1 : 0
    }).format(kilometers) + " km";
  }

  function formatRouteDuration(seconds) {
    const totalMinutes = Math.max(1, Math.round(Number(seconds) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
      return minutes + " min";
    }

    return minutes === 0
      ? hours + " h"
      : hours + " h " + minutes + " min";
  }

  function getRoutePointLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function formatRoutePointCount(count) {
    return count === 5 ? "5 bodů" : count + " body";
  }

  function getVisibleWaypoints() {
    return waypoints.filter(function (waypoint) {
      return (
        isFixedWaypoint(waypoint) ||
        state.route.selectedIds.includes(waypoint.id) ||
        state.activeGroups.has(waypoint.route_group)
      );
    });
  }

  function getFixedWaypoints() {
    return waypoints.filter(isFixedWaypoint);
  }

  function getOptionalWaypoints(routeGroup) {
    return waypoints.filter(function (waypoint) {
      return waypoint.route_group === routeGroup && !isFixedWaypoint(waypoint);
    });
  }

  function isFixedWaypoint(waypoint) {
    const destinationId =
      tripData.trip &&
      tripData.trip.destination &&
      tripData.trip.destination.waypoint_id;

    return waypoint.status === "fixed" || waypoint.id === destinationId;
  }

  function fitVisibleMarkers() {
    const markerCoordinates = Array.from(state.markers.values()).map(function (marker) {
      return marker.getLatLng();
    });

    if (markerCoordinates.length === 0) {
      return;
    }

    if (markerCoordinates.length === 1) {
      state.map.setView(markerCoordinates[0], 10);
      return;
    }

    state.map.fitBounds(L.latLngBounds(markerCoordinates), {
      padding: [38, 38],
      maxZoom: 11
    });
  }

  function fitWaypoints(points) {
    const coordinates = points.map(function (waypoint) {
      return [waypoint.position.lat, waypoint.position.lon];
    });

    if (coordinates.length === 0) {
      return;
    }

    if (coordinates.length === 1) {
      state.map.setView(coordinates[0], 10);
      return;
    }

    state.map.fitBounds(L.latLngBounds(coordinates), {
      padding: [38, 38],
      maxZoom: 11
    });
  }

  function selectWaypoint(waypointId, moveMap) {
    state.selectedId = waypointId;

    document.querySelectorAll("[data-waypoint-id]").forEach(function (item) {
      item.classList.toggle("is-selected", item.dataset.waypointId === waypointId);
    });

    const marker = state.markers.get(waypointId);
    if (!marker) {
      return;
    }

    if (moveMap) {
      const targetZoom = Math.max(state.map.getZoom(), 9);
      state.map.flyTo(marker.getLatLng(), targetZoom, { duration: 0.65 });
      window.setTimeout(function () {
        marker.openPopup();
      }, 420);
    }
  }

  function clearSelection() {
    state.selectedId = null;
    document.querySelectorAll("[data-waypoint-id]").forEach(function (item) {
      item.classList.remove("is-selected");
    });
  }

  function getIconDefinition(waypoint) {
    const registry = tripData.iconRegistry || {};
    const iconId =
      (waypoint.presentation && waypoint.presentation.icon_id) || "destination";

    return registry[iconId] || {
      emoji: "•",
      color: "#215c45"
    };
  }

  function getFeaturedPhoto(waypoint) {
    if (!Array.isArray(waypoint.photos) || waypoint.photos.length === 0) {
      return null;
    }

    return (
      waypoint.photos.find(function (photo) {
        return photo.featured;
      }) || waypoint.photos[0]
    );
  }

  function createStat(label, value) {
    const stat = createElement("div", "popup-stat");
    stat.appendChild(createElement("span", "", label));
    stat.appendChild(createElement("strong", "", value));
    return stat;
  }

  function createLink(label, url, className, openInNewTab) {
    const link = createElement("a", className, label);
    link.href = url;
    if (openInNewTab) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  function getWaypointUrl(waypointId) {
    const baseUrl = String(tripData.waypointBaseUrl || "/waypoints/").replace(
      /\/?$/,
      "/"
    );
    return baseUrl + encodeURIComponent(waypointId) + "/";
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function isValidWaypoint(waypoint) {
    const latitude = waypoint && waypoint.position && Number(waypoint.position.lat);
    const longitude = waypoint && waypoint.position && Number(waypoint.position.lon);

    return (
      waypoint &&
      waypoint.id &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  function formatScore(value) {
    return Number.isFinite(Number(value)) ? value + " / 5" : "Neuvedeno";
  }

  function formatDuration(visit) {
    const duration = visit && visit.recommended_duration_min;
    if (!Array.isArray(duration) || duration.length < 2) {
      return "Neuvedeno";
    }

    return duration[0] + "–" + duration[1] + " min";
  }

  function getRouteLabel(routeGroup) {
    const labels = {
      outbound: "Cesta tam",
      return: "Cesta zpět",
      base: "Černá Hora",
      both: "Start a návrat"
    };

    return labels[routeGroup] || routeGroup || "Zastávka";
  }

  function getStatusLabel(status) {
    const labels = {
      fixed: "Pevný bod",
      selected: "Vybráno",
      candidate: "Kandidát",
      alternative: "Alternativa",
      backup: "Záloha"
    };

    return labels[status] || status || "Místo";
  }

  function sanitizeColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#215c45";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMapError() {
    if (errorElement) {
      errorElement.hidden = false;
    }
  }
})();
