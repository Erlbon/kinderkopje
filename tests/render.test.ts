import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SeasonError,
  classWarnings,
  draftSeason,
  lookupRace,
  parseClasses,
  parseIcs,
  parseProfile,
  parseRegistry,
  parseSeason,
  parseStageTable,
  renderSeason,
  seasonToYaml,
} from "../src/core";

const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const profile = parseProfile(read("data/profiles/peloton.yaml"));
const registry = parseRegistry(read("data/peloton/races.yaml"));
const season = parseSeason(read("data/peloton/2026-fixtures.yaml"), registry);
const threads = renderSeason(profile, registry, season);
const byId = (id: string) => threads.find((t) => t.id === id)!;

describe("one-day race (Strade Bianche 2026 men)", () => {
  const t = byId("strade-bianche-me");
  it("title", () => expect(t.title).toBe("[Race Thread] 2026 Strade Bianche ME (1.UWT)"));
  it("route table", () => {
    expect(t.body).toContain("|Date|From > To|Length|Type|Finish|Time|");
    expect(t.body).toContain(
      "|07.03|[Siena > Siena](https://www.strade-bianche.it/en/men-route/)|203km|punchy|uphill|11:45 – 16:43 CET|",
    );
  });
  it("info rows: auto items first, then season items", () => {
    expect(t.body).toContain(
      "|Information|[Official Site](https://www.strade-bianche.it/en/) / " +
        "[Startlist FC](https://firstcycling.com/race.php?r=54&y=2026&k=8) / " +
        "[Roadbook (pdf)](https://www.strade-bianche.it/wp-content/uploads/2026/03/ySovlhtBGkrnv25rykp1_020326-113530.pdf)|",
    );
    expect(t.body).toContain("|Live Trackers|[PCS](https://www.procyclingstats.com/race/strade-bianche/2026/result/live)|");
    expect(t.body).toContain("|Social Media|[Instagram](https://www.instagram.com/strade_bianche) / ");
  });
  it("flags what is still to fill in", () => {
    expect(t.warnings).toEqual([]); // fixture fills everything required
  });
});

describe("stage race (Tour de France 2026)", () => {
  const t = byId("tour-de-france-me-stage-6");
  it("title has no tag and an en dash", () =>
    expect(t.title).toBe("[Race Thread] 2026 Tour de France – Stage 6 (2.UWT)"));
  it("stage table with weekday date and altitude", () => {
    expect(t.body).toContain("|Date|Stage|Route|Length|Type|Altitude|Finish|Time|");
    expect(t.body).toContain("|---:|---|---|---:|---:|---:|---|---|");
    expect(t.body).toContain(
      "|Thu. 09/07|[6](https://www.letour.fr/en/stage-6)|[Pau > Gavarnie-Gèdre](https://tourview.pages.dev/tdf2026/stage-6)|186km|Hard|3978m|Uphill|12:25-17:46 CET|",
    );
  });
  it("race-level and stage-level info merge", () => {
    expect(t.body).toContain("|Previews|[INRNG](");
    expect(t.body).toContain("|Live Trackers|[Official](https://racecenter.letour.fr/en/) / [Tissot]");
  });
  it("fills everything the fixture provides", () => {
    expect(t.body).toContain("|Where to watch|[CourseDeJour]");
    expect(t.warnings).toEqual([]);
  });
  it("missing values become TBC and are reported", () => {
    const bare = parseSeason(
      ["season: 2026", "races:", "  - race: strade-bianche-we", "    class: 1.WWT", "    date: 2026-03-07"].join(
        String.fromCharCode(10),
      ),
      registry,
    );
    const w = renderSeason(profile, registry, bare)[0]!;
    expect(w.body).toContain("|07.03|TBC|TBC|TBC|TBC|TBC|");
    expect(w.body).toContain("|Previews|TBC|");
    expect(w.warnings).toEqual(
      expect.arrayContaining(["route: route (from > to) missing", "Previews: empty", "Where to watch: empty"]),
    );
  });
  it("extra rows and notes are appended", () => {
    const x = parseSeason(
      [
        "season: 2026",
        "races:",
        "  - race: strade-bianche-me",
        "    class: 1.UWT",
        "    date: 2026-03-07",
        "    extra:",
        "      - { label: Cheat Notes, value: [ { text: Notes, url: 'https://example.org/n' } ] }",
        "    notes: Weather looks dry.",
      ].join(String.fromCharCode(10)),
      registry,
    );
    const b = renderSeason(profile, registry, x)[0]!.body;
    expect(b).toContain("|Cheat Notes|[Notes](https://example.org/n)|");
    expect(b.trimEnd().endsWith("Weather looks dry.")).toBe(true);
  });
});

describe("rest day", () => {
  const t = byId("tour-de-france-me-rest-1");
  it("skeleton with footer and a to-do warning", () => {
    expect(t.title).toBe("[Race Thread] 2026 Tour de France Rest Day 1");
    expect(t.body).toContain("procylingdictionary");
    expect(t.warnings).toContain("recap text: write it");
  });
});

describe("thread order", () => {
  it("is by date", () => {
    const dates = threads.map((t) => t.firstDate);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("validation", () => {
  it("reports every problem at once", () => {
    const bad = "season: 2026" + String.fromCharCode(10) + "races:" + String.fromCharCode(10) +
      "  - race: nowhere" + String.fromCharCode(10) + "    date: 2026-13-45" + String.fromCharCode(10);
    try {
      parseSeason(bad, registry);
      throw new Error("should have failed");
    } catch (e) {
      expect(e).toBeInstanceOf(SeasonError);
      const msg = (e as SeasonError).errors.join(" | ");
      expect(msg).toContain("no name");
      expect(msg).toContain("class");
      expect(msg).toContain("ISO");
    }
  });
});

describe("classifications", () => {
  const classes = parseClasses(read("data/classes.yaml"));
  it("loads the table with string codes", () => {
    expect(classes.map((c) => c.code)).toEqual(
      expect.arrayContaining(["1.UWT", "2.WWT", "1.Pro", "1.1", "2.1", "1.2", "2.2"]),
    );
    expect(classes.every((c) => typeof c.code === "string")).toBe(true);
  });
  it("an unquoted class like 1.1 in a season is read as text", () => {
    const s = parseSeason(
      ["season: 2026", "races:", "  - race: strade-bianche-me", "    class: 1.1", "    date: 2026-03-07"].join(
        String.fromCharCode(10),
      ),
      registry,
    );
    expect(s.races[0]!.class).toBe("1.1");
  });
  it("flags unknown classes and kind mismatches", () => {
    expect(classWarnings("1.UWT", false, classes)).toEqual([]);
    expect(classWarnings("9.X", false, classes)[0]).toContain("not in data/classes.yaml");
    expect(classWarnings("1.UWT", true, classes)[0]).toContain("one-day class but the race has stages");
    expect(classWarnings("2.UWT", false, classes)[0]).toContain("stage-race class but the race has no stages");
  });
  it("renderSeason adds class warnings to the thread", () => {
    const bad = parseSeason(
      ["season: 2026", "races:", "  - race: strade-bianche-me", "    class: 2.UWT", "    date: 2026-03-07"].join(
        String.fromCharCode(10),
      ),
      registry,
    );
    const t = renderSeason(profile, registry, bad, classes)[0]!;
    expect(t.warnings.join(" ")).toContain("stage-race class");
  });
});

describe("iCal draft", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260307",
    "DTEND;VALUE=DATE:20260308",
    "LOCATION:Italy",
    "SUMMARY:Strade Bianche (1.UWT)",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260321",
    "DTEND;VALUE=DATE:20260322",
    "SUMMARY:Milano-Sanremo Donne (1.WWT)",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260307",
    "DTEND;VALUE=DATE:20260314",
    "SUMMARY:Paris-Nice (2.UWT)",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260401",
    "DTEND;VALUE=DATE:20260402",
    "SUMMARY:Small Race (1.2)",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join(String.fromCharCode(13, 10));

  it("reads events with exclusive end dates", () => {
    const ev = parseIcs(ics);
    expect(ev).toHaveLength(4);
    expect(ev[2]).toMatchObject({ start: "2026-03-07", end: "2026-03-13" });
  });
  it("drafts a season: known race via registry, new ones by name, stage race days", () => {
    const s = draftSeason(parseIcs(ics), { year: 2026, registry, classes: ["1.UWT", "2.UWT", "1.WWT", "2.WWT"] });
    expect(s.races).toHaveLength(3);
    expect(s.races[0]).toMatchObject({ race: "strade-bianche-me", class: "1.UWT", date: "2026-03-07" });
    const paris = s.races.find((r) => r.name === "Paris-Nice")!;
    expect(paris.stages).toHaveLength(7);
    const msr = s.races.find((r) => r.category === "WE")!;
    expect(msr.race).toBe("milano-sanremo-donne-we");
  });
  it("a drafted season survives YAML and validates", () => {
    const s = draftSeason(parseIcs(ics), { year: 2026, registry });
    const back = parseSeason(seasonToYaml(s), registry);
    expect(back.races.length).toBe(s.races.length);
  });
});

describe("Wikipedia stage table", () => {
  const wt = read("tests/fixtures/tdf2026-stages.wikitext");
  const d = parseStageTable(wt, 2026);
  it("reads stages with dates, courses, lengths and types", () => {
    expect(d.stages.map((s) => s.n)).toEqual([1, 2, 3, 6, 10]);
    expect(d.stages[0]).toMatchObject({ date: "2026-07-04", from: "Barcelona", to: "Barcelona", length: 19.6, type: "TTT" });
    expect(d.stages[1]).toMatchObject({ from: "Tarragona", to: "Barcelona", length: 169, type: "hilly" });
    expect(d.stages[2]).toMatchObject({ from: "Granollers", to: "Les Angles", type: "mountain" });
    expect(d.stages[3]).toMatchObject({ date: "2026-07-09", from: "Pau", to: "Gavarnie-Gèdre", length: 186, type: "mountain" });
  });
  it("finds rest days", () => expect(d.restDays).toEqual(["2026-07-13", "2026-07-20"]));
  it("returns nothing when the page has no stage table", () => {
    expect(parseStageTable("just text", 2026)).toEqual({ stages: [], restDays: [] });
  });
  it("lookupRace reads official site and Wikipedia link via an injected fetch", async () => {
    const fake = (async (url: string) => {
      const body = String(url).includes("wbsearchentities")
        ? { search: [{ id: "Q1", label: "Strade Bianche", description: "race" }] }
        : { entities: { Q1: { claims: { P856: [{ mainsnak: { datavalue: { value: "https://www.strade-bianche.it/" } } }] }, sitelinks: { enwiki: { url: "https://en.wikipedia.org/wiki/Strade_Bianche" } } } } };
      return { ok: true, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    const r = await lookupRace("Strade Bianche", fake);
    expect(r[0]).toMatchObject({ officialSite: "https://www.strade-bianche.it/", wikipedia: "https://en.wikipedia.org/wiki/Strade_Bianche" });
  });
});
