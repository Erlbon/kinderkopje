# Third-party material

The code of this repository is under the MIT licence (see `LICENSE`). The files below are not covered by it.

## Test fixtures

- `tests/fixtures/wiki-worldteams-2026.wikitext`, `tests/fixtures/wiki-proteams-2026.wikitext` and
  `tests/fixtures/tdf2026-stages.wikitext` are short excerpts of Wikipedia articles ("UCI WorldTeam",
  "List of 2026 UCI ProTeams and Continental teams", "2026 Tour de France"), used to test the parsers.
  Wikipedia text is available under the Creative Commons Attribution-ShareAlike 4.0 licence
  (https://creativecommons.org/licenses/by-sa/4.0/); the authors are listed in each article's page history.
- `tests/fixtures/old-*.md` and `tests/fixtures/internal-tdf-2026.md` are copies of race threads and a stage table
  posted on r/peloton, used to test the importers. They stay the property of their authors.
- `tests/fixtures/dataride-capture-sample.json` holds a few team names, codes and ranking points read from the
  public UCI DataRide ranking pages. UCI data belongs to the Union Cycliste Internationale (UCI).

## Data the tool reads

The tool itself ships no UCI or Wikipedia data. When you use it, it reads pages that you open yourself (UCI DataRide
and uci.org race pages, saved or captured in your own browser) and, on request, Wikipedia and Wikidata through their
public APIs. That data belongs to its owners: UCI for rankings, calendars and results, Wikipedia/Wikidata for their
content (Wikidata is CC0; Wikipedia text is CC BY-SA). Please follow their terms when you publish what you collect,
and credit the source.

## Software it is built with

- sql.js (MIT), SQLite compiled to WebAssembly: https://github.com/sql-js/sql.js. SQLite itself is in the public domain.
- yaml (ISC), esbuild (MIT), TypeScript (Apache-2.0), Vitest (MIT): build and test tools.
