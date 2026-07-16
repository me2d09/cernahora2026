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

The site uses a custom Jekyll generator to create waypoint pages directly from `_data/waypoints.yml`. GitHub Pages branch builds run Jekyll in safe mode and do not execute repository plugins, so deployment is handled by `.github/workflows/pages.yml`.

In the repository settings, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. A push to `main` then builds and deploys the site. Pull requests run the same build without deploying.

The production address and project path are configured in `_config.yml`:

```yaml
url: "https://me2d09.github.io"
baseurl: "/cernahora2026"
```

Internal assets use Jekyll's `relative_url` filter and therefore work under the GitHub Pages project subpath.

## Map provider configuration

The map includes a visible base-layer switcher. OpenStreetMap and Mapy.com are both configured, while `provider` controls which one is selected on initial load:

```yaml
map:
  provider: openstreetmap
  mapy_api_key: "PUBLIC_DOMAIN_RESTRICTED_WEB_KEY"
  mapy_mapset: outdoor
```

Set `provider: mapy` to make Mapy.com the initial layer without removing the OpenStreetMap option.

Available Mapy.com raster map sets include `basic`, `outdoor`, `winter`, and `aerial`. Mapy.com calls require an API key and consume project credits. A key embedded in a static GitHub Pages site is visible to visitors, so it must be a web key intended for client-side use and protected with the restrictions supported by Mapy.com.

The Mapy.com logo and copyright attribution are added only while the Mapy.com layer is active. OpenStreetMap displays its own attribution when selected.

## Waypoint presentation

Each valid entry from `waypoints` is rendered in two places:

- as an accessible button in the waypoint list;
- as a Leaflet marker with a compact popup card.

Prague and XIO Apartments are fixed map points and remain visible at all times. Outbound, return, and stay locations are independent optional layers. Enabling a layer fits the viewport only to that layer's optional points, so fixed Prague does not affect the outbound or return zoom. Empty optional layers are shown with a zero count and disabled until data is added.

The popup uses existing fields when available:

- featured photo and its license source page;
- route group and selection status;
- short name and summary;
- `wow`, `kids`, and recommended visit duration;
- external map and navigation links.
- an internal link to the complete waypoint page.

Missing optional fields are handled gracefully. Coordinates are validated in the browser before a waypoint is displayed.

## Waypoint detail pages

The `_plugins/waypoint_page_generator.rb` generator reads every record in `_data/waypoints.yml` during the Jekyll build and creates a virtual page at `/waypoints/<id>/`. The generated page receives the complete waypoint record and renders it through `_layouts/waypoint.html`.

The detail pages include all waypoint fields: identity and classification, location and coordinates, summary, highlights, activities, family suitability, visit recommendations, swimming information, logistics, ratings, tags, external links, notes, and every available photo with its source and license note.

This keeps `_data/waypoints.yml` as the only content source. Adding, removing, or renaming a waypoint there automatically changes the generated pages on the next build; no matching Markdown file is needed.

```text
/cernahora2026/waypoints/stopica-cave/
```

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
│   ├── default.html
│   └── waypoint.html
├── _plugins/
│   └── waypoint_page_generator.rb
├── .github/
│   └── workflows/
│       └── pages.yml
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
