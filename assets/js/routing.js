(function () {
  "use strict";

  class MapyRoutingProvider {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.endpoint = "https://api.mapy.com/v1/routing/route";
    }

    async calculate(start, end, options) {
      if (!this.apiKey) {
        throw new Error("Mapy.com API key is not configured.");
      }

      const parameters = new URLSearchParams({
        apikey: this.apiKey,
        start: formatPosition(start),
        end: formatPosition(end),
        routeType: "car_fast",
        format: "geojson",
        lang: "cs"
      });

      const response = await fetch(this.endpoint + "?" + parameters, {
        signal: options && options.signal
      });
      const data = await response.json().catch(function () {
        return null;
      });

      if (!response.ok) {
        const error = new Error(getErrorMessage(response.status, data));
        error.status = response.status;
        throw error;
      }

      if (
        !data ||
        !data.geometry ||
        data.geometry.type !== "Feature" ||
        !Number.isFinite(Number(data.length)) ||
        !Number.isFinite(Number(data.duration))
      ) {
        throw new Error("Mapy.com returned an incomplete route.");
      }

      return data;
    }
  }

  function formatPosition(waypoint) {
    return waypoint.position.lon + "," + waypoint.position.lat;
  }

  function getErrorMessage(status, data) {
    if (status === 401 || status === 403) {
      return "Routing is not available for the configured Mapy.com API key.";
    }

    if (status === 404) {
      return "A drivable route between these points could not be found.";
    }

    if (status === 422) {
      return "The selected points cannot be used for route planning.";
    }

    const detail = data && data.detail;
    if (typeof detail === "string") {
      return detail;
    }

    return "Route calculation failed.";
  }

  window.MapyRoutingProvider = MapyRoutingProvider;
})();

