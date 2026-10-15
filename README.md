# racethreads

Season YAML in, Reddit-ready race threads out. Built for the r/peloton moderators; the
layout lives in a profile file, so other communities can reuse it.

It is a single static page that runs in your browser. Nothing is uploaded and nothing is
fetched from other sites.

## Using it

- **Online:** the GitHub Pages site (enabled from the repo settings: Pages, source GitHub Actions).
- **Offline:** download `racethreads.html` from the latest release and open it.

1. Optional: open a calendar `.ics` (for example the INRNG feed, saved from your browser). The page
   drafts a season: one-day races, plus stage races with one empty stage per day.
2. Edit the season YAML. Fill in route, length, type, times, previews, where to watch.
3. Press **Generate threads**. Each thread has Copy title / Copy body buttons and lists what is
   still `TBC`. Paste into Reddit's scheduled posts (Markdown mode).

## Data files

| File | What |
|---|---|
| `data/profiles/peloton.yaml` | Title templates, table columns, info rows, rest-day text. Edit when the community changes its layout. |
| `data/peloton/races.yaml` | Races that return every year (official site, socials, FirstCycling id, PCS slug), per category. Enter once. |
| `data/peloton/<year>.yaml` | The season: dates, route details, per-race extras. `2026-fixtures.yaml` holds two real threads as test fixtures. |

Standard layout plus extras: any race or stage can add `extra:` rows and a free-text `notes:`.
Race-level extras apply to every thread of that race.

Thread types: one-day race, stage (one per stage), rest day (list the dates in `restDays:`, used for
the three-week Grand Tours), and an optional overall thread (`mega: true`).

## Data sources

The tool reads no websites. Calendars come from files you give it. Some sites (ProCyclingStats,
FirstCycling) forbid automated access, so the plan is for moderators to save pages from their own
browser. Do not add scrapers for sites that ban them without their written permission.

## Developing

```
npm install
npm run check    # type check + tests
npm run build    # dist/index.html, one self-contained file
```

Enable the hooks once per clone: `git config core.hooksPath .githooks`
(pre-commit: control-character and syntax gate; pre-push: tests).

Releases: tag `v0.1.0` and push the tag; the workflow attaches `racethreads.html`.
