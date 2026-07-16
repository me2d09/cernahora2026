(function () {
  "use strict";

  const dataElement = document.getElementById("map-data");
  const mapElement = document.getElementById("trip-map");
  const listElement = document.getElementById("waypoint-list");
  const countElement = document.getElementById("waypoint-count");
  const errorElement = document.getElementById("map-error");

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

  const state = {
    activeGroups: new Set(),
    activeProvider: null,
    baseLayers: {},
    map: null,
    mapyLogoControl: null,
    markers: new Map(),
    selectedId: null
  };

  renderWaypointList(getVisibleWaypoints());
  updateFilterCounts();
  bindFilters();

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
    bindProviderSwitch();
    setMapProvider(getInitialProvider());
    addVisibleMarkers(waypoints);
    fitVisibleMarkers();

    state.map.on("click", clearSelection);
    state.map.on("focus", function () {
      state.map.scrollWheelZoom.enable();
    });
    state.map.on("blur", function () {
      state.map.scrollWheelZoom.disable();
    });
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
    if (state.activeProvider === "mapy") {
      if (!state.mapyLogoControl) {
        state.mapyLogoControl = createMapyLogoControl();
      }
      state.map.addControl(state.mapyLogoControl);
      return;
    }

    if (state.mapyLogoControl) {
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
    const markerHtml =
      '<div class="trip-marker" style="--marker-color:' +
      sanitizeColor(iconDefinition.color) +
      '"><span aria-hidden="true">' +
      escapeHtml(iconDefinition.emoji || "•") +
      "</span></div>";

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
    if (waypoint.links && waypoint.links.google_maps) {
      actions.appendChild(
        createLink(
          "Navigovat",
          waypoint.links.google_maps,
          "popup-link popup-link--primary",
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

  function getVisibleWaypoints() {
    return waypoints.filter(function (waypoint) {
      return (
        isFixedWaypoint(waypoint) ||
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
    return waypoint.id === "prague-start" || waypoint.id === "xio-apartments-bar";
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
