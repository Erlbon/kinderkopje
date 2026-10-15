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

## Team points (UCI World Ranking)

First slice of the data cube: team ranking snapshots by date, from UCI DataRide. UCI points only.

1. Drag the **Capture UCI table** link from the page to your bookmarks bar (the source is `tools/capture-dataride.js`).
2. On DataRide open a *team ranking* page. Pick the season and date with the page's own dropdowns (the address
   does not change when you do, so links cannot select a season). Press the bookmark on each page of the table
   (40 teams per page). It copies only the rows already on screen and sends no requests of its own.
3. Press *Download collection* in its box and open the file in racethreads. Repeat for each date you want.

The page then shows the seasons side by side (the latest ranking captured for each season), season to date against
the same date last year, and points earned per month against last year. Rules: the ranking used for "the same date last year" is the latest one on or before that day, never a later
one; a month's points need the previous month-end ranking, otherwise the month stays empty; teams are matched by
UCI's team id (the same team keeps its id when its name or code changes, as with UAD in 2025 and UEX in 2026).
The id follows UCI's licence, so it can join teams that are different organisations (the Qhubeka licence became
Q36.5): check a line that jumps oddly.

Merged teams are listed in `data/cube/team-lineage.yaml` (Lotto and Intermarché-Wanty merged for 2026, UCI ids 929
and 1372). With "Combine merged teams" ticked, earlier seasons add the two teams' points together so that the
merged team compares like with like; ranks in those seasons are where the combined total would stand.
Capture the month-end rankings (and the latest ranking) for each season you want to compare.

UCI points reset on 1 January, so every ranking is a season-to-date total and January's monthly figure is the
total itself. Seasons still being raced are listed in `data/cube/seasons.yaml` (2026 for now); the page leaves
them out unless you tick "Include unfinished seasons". Remove the year from that file once its final ranking
(after the last race) has been captured.

### WorldTeams and ProTeams

The main interest is the WorldTeams (WT) and ProTeams (PT); lower-level teams matter when they beat them.
"Look up team levels (Wikipedia)" fetches, for each captured season, the WorldTeam list (the "UCI WorldTeam"
article) and the ProTeam list ("List of <year> UCI ProTeams and Continental teams"), one request at a time with
a pause, and matches them to the captured teams by UCI code and then by name. Anything not found is shown;
a team outside the captured part of a ranking (only the pages you captured) cannot be matched. Levels are
saved in the cube. With "Only WorldTeams and ProTeams" ticked the tables show just those teams, and a table
lists every WT/PT team that a lower-level team finished above. Wikipedia is a secondary source: check the
unmatched list.

## Stage tables

Paste the table from your internal work thread into "Import a stage table". Columns are found by their
header names, so any order works (Date first, Stage first ...). It reads the stage link, route (and its
map/profile image link), length in km, type and finish (with their image links), altitude in metres and
the times. Days without a stage between two stages become rest days. What you paste wins over data already
in the season.

## Table layout

Moderators build their tables differently. The "Table layout" section lets you drag the column headers into
your own order, switch columns on and off, rename them, set alignment, and choose how dates (for example
`09/07`, `Thu. 09/07`, `13.Sep`, `13 Sep`), lengths (`186km`, `186 km`, `186,2`) and times are written.
Your layout is saved in your browser and can be shared as YAML. Named layouts (such as the Vuelta's
stage-first table) live in `data/profiles/peloton.yaml`; a race can ask for one with `table:` in the registry.

## Easy / Medium / Hard

`typeByAltitude` in the profile gives the Type from the metres climbed: Easy up to 2000, Medium 2001-3499,
Hard 3500 and up. It fills in a missing Type, and warns when a Type you wrote disagrees with the rule
(for example a stage of 3950 m marked Medium). TTT and ITT are not checked. Length is stored in km and
altitude in metres.

## Learning from old threads

Paste old race threads (markdown) into "Learn from old threads". The tool reads the title (year, name,
ME/WE, class) and the Information rows, and fills the race registry:

- **Carries over every year:** official site, Wikipedia page, Social Media, FirstCycling id (from the start
  list link), PCS slug (from the live-tracker link) and any other Information links.
- **Left out as year-specific:** Roadbook, Previews, /r/Peloton Content, Where to watch, other trackers.
- Row names from different years are understood (Live Tracker/Live Trackers, TV/Streams/Where to Watch ...).
  A row with words around its links (for example "on HBO Max, ...") is kept as plain markdown.
- Men's and women's editions become separate registry entries (their FirstCycling ids and PCS slugs differ).

From then on a new season only needs the race listed: the Information, Social Media and Live Trackers
rows fill themselves in with the new year.

## Wikipedia helpers

The page can draft data from Wikipedia and Wikidata (their APIs allow this and the page calls them
straight from your browser):

- **Fill stages + rest days:** reads the "Stage characteristics" table of an edition page
  (for example `2026 Tour de France`): stage numbers, dates, courses, lengths, types, rest days.
  Anything you already typed for a stage is kept; Wikipedia only fills gaps.
- **Look up website:** finds the race on Wikidata and offers its official website and Wikipedia link
  for the race registry. Men's and women's editions are separate entries; pick the right one.

Wikipedia is a secondary source. Its stage types (flat, hilly, mountain, ITT, TTT) are not the same
vocabulary as r/peloton's own Type values (for example "Hard"), so treat them as drafts.

## Race classes

`data/classes.yaml` lists the UCI classification codes (1.UWT, 2.WWT, 1.Pro, 1.1 ... and WC for
championships). Class codes are checked: an unknown class, or a one-day class on a race with stages,
shows up as a warning on the thread. The calendar import offers WorldTour/WWT, ProSeries and
championships by default.

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
