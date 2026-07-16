# Montenegro Roadtrip 2026

A responsive Jekyll website for presenting and planning a family roadtrip from Prague to Montenegro. The current version contains one main section: an interactive map with candidate stops for the outbound and return journeys.

All trip content is loaded from `_data/waypoints.yml`. That file is treated as the source of truth and should not be duplicated in JavaScript or templates.

## Technology

- Jekyll and the GitHub Pages gem
- Leaflet 1.9.4
- Vanilla JavaScript and CSS
- OpenStreetMap tiles as the zero-configuration default
- Optional Mapy.com raster tiles

Leaflet was selected because it is lightweight, works well with raster tile providers, and can render GeoJSON route geometry returned by the Mapy.com Routing API. The map provider and route provider are deliberately separate concerns.

## Local development

Requirements:

- Ruby
- Bundler

Install dependencies and start the local server:

```sh
bundle install
bundle exec jekyll serve
```

Open `http://127.0.0.1:4000/`.

Build the production site:

```sh
bundle exec jekyll build
```

The generated site is written to `_site/`.

## GitHub Pages

The repository uses the supported `github-pages` gem and does not require a custom build pipeline.

Before publishing a project site, set the repository path in `_config.yml`:

```yaml
url: "https://your-account.github.io"
baseurl: "/your-repository"
```

Internal assets use Jekyll's `relative_url` filter and therefore work under a GitHub Pages project subpath.

## Map provider configuration

The default configuration uses OpenStreetMap raster tiles:

```yaml
map:
  provider: openstreetmap
  mapy_api_key: ""
  mapy_mapset: outdoor
```

To use Mapy.com:

1. Create an API project and a web API key at [developer.mapy.com](https://developer.mapy.com/).
2. Restrict and monitor the key according to the provider documentation.
3. Set `provider` to `mapy`.
4. Set `mapy_api_key` to the project key.
5. Review the current Mapy.com attribution requirements before deployment.

```yaml
map:
  provider: mapy
  mapy_api_key: "YOUR_PUBLIC_WEB_API_KEY"
  mapy_mapset: outdoor
```

Available Mapy.com raster map sets include `basic`, `outdoor`, `winter`, and `aerial`. Mapy.com calls require an API key and consume project credits. A key embedded in a static GitHub Pages site is visible to visitors, so it must be a web key intended for client-side use and protected with the restrictions supported by Mapy.com.

## Waypoint presentation

Each valid entry from `waypoints` is rendered in two places:

- as an accessible button in the waypoint list;
- as a Leaflet marker with a compact popup card.

The popup uses existing fields when available:

- featured photo and its license source page;
- route group and selection status;
- short name and summary;
- `wow`, `kids`, and recommended visit duration;
- external map and navigation links.

Missing optional fields are handled gracefully. Coordinates are validated in the browser before a waypoint is displayed.

## Future routing

Mapy.com routing can be added without replacing Leaflet. The intended integration is:

1. select a route variant or ordered waypoint set;
2. call `GET https://api.mapy.com/v1/routing/route`;
3. request `format=geojson`;
4. pass the returned `geometry` feature to `L.geoJSON`;
5. display returned distance, duration, and segment details separately from the marker layer.

The routing API accepts up to 15 intermediate waypoints per request. Provider-specific calls should remain isolated in a small adapter rather than being mixed into marker rendering.

## Project structure

```text
.
├── _config.yml
├── _data/
│   └── waypoints.yml
├── _layouts/
│   └── default.html
├── assets/
│   ├── css/
│   │   └── main.css
│   └── js/
│       └── map.js
├── AGENTS.md
├── Gemfile
├── README.md
└── index.html
```

