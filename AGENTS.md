# AGENTS.md

## Project Overview

This repository contains a small public website for planning and presenting a trip to Montenegro.

The core experience is an interactive map with places the group plans to visit. The first version should focus on clearly displaying waypoints and useful trip information. Later versions may add route calculation, daily itineraries, filters, and other planning features.

The site is deployed through GitHub Pages and built with Jekyll.

## Communication and Language

- The user may provide instructions and content in Czech.
- All source code, identifiers, filenames, code comments, commit messages, and technical documentation must be written in English.
- User-facing trip content may be in Czech unless the user requests another language.
- Keep responses to the user practical and concise. Explain important trade-offs in Czech when appropriate.

## Primary Technical Constraints

- Keep the site compatible with GitHub Pages.
- Use Jekyll for layouts, includes, data files, and static-site generation.
- Prefer plain HTML, CSS, and modern vanilla JavaScript over a frontend framework.
- Use Leaflet for the interactive map unless there is a clear, documented reason to choose another lightweight library.
- Do not require a server-side application or runtime API owned by this project.
- Do not add a JavaScript build pipeline unless the project grows enough to justify it.
- Avoid Jekyll plugins that are not supported by GitHub Pages. If an unsupported plugin is truly necessary, document the required GitHub Actions build and deployment workflow first.
- Never commit secrets, private API keys, personal access tokens, or sensitive travel information.

## Architecture Guidelines

Keep content, presentation, and map behavior separate.

Recommended structure:

```text
.
├── _config.yml
├── _data/
│   └── waypoints.yml
├── _includes/
├── _layouts/
├── assets/
│   ├── css/
│   ├── images/
│   └── js/
├── index.html
├── Gemfile
└── README.md
```

- Store waypoint and itinerary content in Jekyll data files, not directly inside map JavaScript.
- Render structured waypoint data into the page in a safe, machine-readable form, then initialize the map from it.
- Keep map initialization, marker rendering, filtering, and routing in small focused JavaScript modules or functions.
- Treat routing as a separate capability from waypoint display. The map must remain useful when routing is unavailable.
- Keep provider-specific routing or geocoding code behind a small adapter so the provider can be changed later.
- Use Jekyll's `relative_url` or `absolute_url` filters for internal assets and links so the site works from a GitHub Pages project subpath.

## Waypoint Data

Use stable waypoint IDs and a predictable schema. A waypoint should be able to support fields such as:

```yaml
- id: kotor-old-town
  name: Kotor Old Town
  latitude: 42.4247
  longitude: 18.7712
  category: sightseeing
  day: 1
  description: Historic center of Kotor.
  url: https://example.com
```

Guidelines:

- `id`, `name`, `latitude`, and `longitude` are the minimum useful fields.
- Coordinates must be numeric and within valid latitude and longitude ranges.
- IDs must be unique, lowercase, and kebab-cased.
- Optional values must fail gracefully when absent.
- Do not duplicate the same location data in JavaScript and YAML.
- Do not publish exact accommodation locations or other sensitive personal details without explicit confirmation.

## Map Requirements

- The map must work on both mobile and desktop layouts.
- Every tile, map data, geocoding, or routing provider must receive its required attribution.
- Do not remove or obscure Leaflet or tile-provider attribution.
- Respect provider usage policies, request limits, and licensing terms.
- Do not assume public OpenStreetMap tile servers are suitable for heavy production traffic.
- Fit the initial viewport to the available waypoints, with a sensible Montenegro fallback view when no waypoints exist.
- Marker popups must remain usable with touch, keyboard navigation, and narrow screens.
- Keep a non-map representation of important locations, such as an itinerary or waypoint list, so essential content is accessible without interacting with the map.
- Handle missing data, failed network requests, and unavailable third-party services without breaking the page.

## UI and Content Guidelines

- Prioritize the map and trip plan; avoid unnecessary dashboard complexity.
- Use a responsive, mobile-first layout.
- Use semantic HTML and accessible controls.
- Ensure visible keyboard focus, sufficient color contrast, and meaningful labels.
- Do not communicate categories or route states by color alone.
- Keep animations subtle and respect `prefers-reduced-motion`.
- Optimize images before committing them and provide useful alternative text.
- Avoid loading large libraries for features that can be implemented simply.

## Implementation Workflow

Before changing code:

1. Inspect the existing structure and follow established patterns.
2. Check the current Git status and preserve unrelated user changes.
3. Identify whether the change affects GitHub Pages compatibility or third-party service terms.

While changing code:

1. Make the smallest coherent change that solves the requested problem.
2. Keep trip data out of presentation and behavior files.
3. Preserve graceful behavior when JavaScript or external services fail.
4. Update documentation when setup, data schemas, or deployment behavior changes.

After changing code:

1. Build the site locally.
2. Check the generated site from the same subpath shape used by GitHub Pages.
3. Test the main flow at narrow mobile and desktop viewport sizes.
4. Check the browser console for errors.
5. Verify internal links, map attribution, marker behavior, and the non-map waypoint list.

## Local Development and Validation

Use the repository's documented commands when available. For a standard GitHub Pages setup, expected commands are:

```sh
bundle install
bundle exec jekyll serve
bundle exec jekyll build
```

When dependencies and scripts are added, keep `README.md` up to date with exact setup and validation commands.

Before handing off a change, run the most relevant available checks. At minimum:

- `bundle exec jekyll build`
- any configured HTML, CSS, JavaScript, YAML, or Markdown linters
- any configured automated tests

If a check cannot be run, state what was not verified and why.

## Dependency Policy

- Prefer dependencies already present in the project.
- Add a dependency only when it provides clear value over a small local implementation.
- Pin versions where practical and commit the appropriate lockfile.
- Load third-party browser assets in a consistent way. Prefer locally managed assets or reputable version-pinned CDNs with integrity metadata when feasible.
- Document external services, required accounts, tokens, quotas, and privacy implications.
- Client-side API keys must be explicitly designed for public exposure and restricted by the provider where possible.

## GitHub Pages Deployment

- Assume the site may be served from `https://<owner>.github.io/<repository>/`, not from the domain root.
- Do not hardcode root-relative project URLs such as `/assets/...`.
- Keep `_config.yml` values for `url` and `baseurl` compatible with the deployment target.
- Prefer the standard GitHub Pages build unless the project explicitly adopts a GitHub Actions workflow.
- Changes to deployment workflows must use pinned action versions and minimal permissions.

## Scope Discipline

- Do not add routing, geocoding, authentication, analytics, or a CMS unless requested.
- Do not redesign unrelated parts of the site while implementing a focused feature.
- Do not introduce a frontend framework solely for component organization.
- When requirements are ambiguous, choose a simple, reversible implementation and document the assumption.

## Definition of Done

A change is complete when:

- it fulfills the requested behavior;
- the Jekyll build succeeds;
- it works under the expected GitHub Pages base path;
- the map and essential trip content are usable on mobile and desktop;
- third-party attribution and licensing requirements are preserved;
- accessibility and failure states have been considered;
- relevant documentation and example data are updated;
- no secrets or sensitive personal travel data were added.
