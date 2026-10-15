import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProfile, parseRegistry, parseSeason, parseUciCompetition, parseUciDates, parseUciHub, registryFromCompetition, renderSeason, seasonToYaml, uciHubToSeason } from "../src/core";

const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// Rebuilds the structure of a saved UCI hub page (races, dates and ids as on the 2027 WorldTour page).
function hubHtml(title: string, races: { name: string; dates: string; month: number; id: number; country?: string }[]): string {
  const byMonth = new Map<number, typeof races>();
  for (const r of races) byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]);
  const months = [...byMonth.entries()].map(([month, rs]) => ({
    month,
    year: 2027,
    items: rs.map((r) => ({
      day: 1,
      month,
      year: 2027,
      items: [{ name: r.name, venue: "x", country: r.country ?? "ITA", dates: r.dates, detailsLink: { url: "/competition-details/2027/ROA/" + r.id } }],
    })),
  }));
  const content = '<div data-component="CalendarSchedule" data-prop-months="' + esc(JSON.stringify(months)).replace(/&amp;/g, "&") + '"></div>';
  const props = { competitionHubHeader: { competitionTitle: title }, tabs: { tabs: [{ slug: "overview", content: "" }, { slug: "races-results", content }] } };
  return '<html><body><div data-component="HubsModule" data-props="' + esc(JSON.stringify(props)) + '"></div></body></html>';
}

const races = [
  { name: "Strade Bianche", dates: "06 Mar 2027", month: 3, id: 79677 },
  { name: "Paris-Nice", dates: "07 Mar - 14 Mar 2027", month: 3, id: 79676, country: "FRA" },
  { name: "Paris-Nice", dates: "07 Mar - 14 Mar 2027", month: 3, id: 79676, country: "FRA" }, // listed twice, as on the page
  { name: "Mapei Cadel Evans Great Ocean Road Race - Men", dates: "31 Jan 2027", month: 1, id: 79671, country: "AUS" },
  { name: "Giro d'Italia", dates: "08 May - 30 May 2027", month: 5, id: 79714 },
];

describe("UCI dates", () => {
  it("reads a single day and a range", () => {
    expect(parseUciDates("31 Jan 2027")).toEqual({ start: "2027-01-31", end: "2027-01-31" });
    expect(parseUciDates("08 May - 30 May 2027")).toEqual({ start: "2027-05-08", end: "2027-05-30" });
    expect(parseUciDates("28 Dec - 02 Jan 2027")).toEqual({ start: "2026-12-28", end: "2027-01-02" });
    expect(parseUciDates("TBC")).toBeUndefined();
  });
});

describe("UCI hub page", () => {
  const hub = parseUciHub(hubHtml("2027 UCI WorldTour", races));
  it("reads the calendar, once per race, in date order", () => {
    expect(hub.title).toBe("2027 UCI WorldTour");
    expect(hub.year).toBe(2027);
    expect(hub.races.map((r) => [r.name, r.start, r.end, r.uciId])).toEqual([
      ["Mapei Cadel Evans Great Ocean Road Race - Men", "2027-01-31", "2027-01-31", 79671],
      ["Strade Bianche", "2027-03-06", "2027-03-06", 79677],
      ["Paris-Nice", "2027-03-07", "2027-03-14", 79676],
      ["Giro d'Italia", "2027-05-08", "2027-05-30", 79714],
    ]);
  });
  it("complains clearly about a page without the calendar", () => {
    expect(() => parseUciHub("<html></html>")).toThrow(/UCI competition hub page/);
  });

  const registry = parseRegistry(read("data/peloton/races.yaml"));
  const season = uciHubToSeason(hub, registry);
  it("drafts one-day races and stage races with the right classes", () => {
    const byId = (id: string) => season.races.find((r) => r.race === id)!;
    expect(byId("strade-bianche-me")).toMatchObject({ class: "1.UWT", date: "2027-03-06", uciId: 79677 });
    expect(byId("strade-bianche-me").name).toBeUndefined(); // already in the registry
    expect(byId("paris-nice-me")).toMatchObject({ class: "2.UWT", name: "Paris-Nice", category: "ME" });
    expect(byId("paris-nice-me").stages).toHaveLength(8);
    expect(byId("giro-d-italia-me").stages).toHaveLength(23); // 8-30 May; rest days come from the real stage list
    expect(byId("great-ocean-road-race-me")).toBeUndefined();
  });
  it("takes the men/women suffix out of the name", () => {
    const r = season.races.find((x) => x.uciId === 79671)!;
    expect(r).toMatchObject({ name: "Mapei Cadel Evans Great Ocean Road Race", category: "ME", class: "1.UWT" });
  });
  it("the draft is a valid season that renders", () => {
    const back = parseSeason(seasonToYaml(season), registry);
    const profile = parseProfile(read("data/profiles/peloton.yaml"));
    const threads = renderSeason(profile, registry, back);
    expect(threads.length).toBe(1 + 1 + 8 + 23);
  });
  it("a women's hub gives WWT classes", () => {
    const w = uciHubToSeason(parseUciHub(hubHtml("2027 UCI Women's WorldTour", [{ name: "Strade Bianche Women", dates: "06 Mar 2027", month: 3, id: 1 }])), registry);
    // the women's Strade Bianche is already in the registry, so it is matched, not renamed
    expect(w.races[0]).toMatchObject({ race: "strade-bianche-we", class: "1.WWT" });
    const fresh = uciHubToSeason(parseUciHub(hubHtml("2027 UCI Women's WorldTour", [{ name: "Some New Race", dates: "06 Mar 2027", month: 3, id: 2 }])), registry);
    expect(fresh.races[0]).toMatchObject({ race: "some-new-race-we", name: "Some New Race", category: "WE", class: "1.WWT" });
  });
});

describe("UCI competition page", () => {
  // Paris-Tours 2026 as on uci.org (organiser contact and officials left out of this fixture on purpose)
  const props = {
    competitionDetails: {
      name: "Paris - Tours Elite", dates: "11 Oct 2026", venue: "", country: "France",
      competitionClass: "1.Pro - 1 day - UCI ProSeries",
      website: { title: "www.letour.fr", url: "https://www.letour.fr", isExternal: true },
    },
    schedule: { items: [{ date: "11 Oct 2026", races: [{ raceName: "Final Classification", raceType: "Individual Road Race", raceClass: "1.Pro - 1 day - UCI ProSeries", category: "Men Elite" }] }] },
    results: { accordion: [{ results: [{ title: "General Classification", eventCode: "D2EV378785", raceType: "A" }], label: "Final Classification" }] },
  };
  const html = '<html><div data-component="CompetitionDetailsModule" data-props="' + esc(JSON.stringify(props)) + '"></div></html>';

  it("reads class, dates, official website, categories and the results event code", () => {
    expect(parseUciCompetition(html, 78462)).toEqual({
      uciId: 78462, name: "Paris - Tours Elite", dates: { start: "2026-10-11", end: "2026-10-11" }, country: "France", venue: "",
      class: "1.Pro", classText: "1.Pro - 1 day - UCI ProSeries", website: "https://www.letour.fr",
      categories: ["Men Elite"], eventCodes: ["D2EV378785"],
    });
  });
  it("leaves organiser emails out by default and never reads officials' names", () => {
    const withPeople = { ...props, competitionDetails: { ...props.competitionDetails, email: { url: "mailto:someone@example.org" } }, assignments: [{ name: "SOME PERSON", role: "President of the Commissaires Panel" }] };
    const page = '<div data-component="CompetitionDetailsModule" data-props="' + esc(JSON.stringify(withPeople)) + '"></div>';
    const r = JSON.stringify(parseUciCompetition(page));
    expect(r).not.toContain("someone@example.org");
    expect(r).not.toContain("SOME PERSON");
    const asked = parseUciCompetition(page, undefined, { contact: true });
    expect(asked.email).toBe("someone@example.org");
    expect(JSON.stringify(asked)).not.toContain("SOME PERSON");
    expect(registryFromCompetition(asked)).toMatchObject({ contactEmail: "someone@example.org" });
  });
  it("adds the official site to a registry entry without overwriting one that is there", () => {
    const comp = parseUciCompetition(html);
    expect(registryFromCompetition(comp)).toEqual({ name: "Paris - Tours", category: "ME", officialSite: "https://www.letour.fr" });
    expect(registryFromCompetition(comp, { name: "Paris-Tours", category: "ME", officialSite: "https://example.org/mine" })!.officialSite).toBe("https://example.org/mine");
  });
  it("complains about a page that is not a competition page", () => {
    expect(() => parseUciCompetition("<html></html>")).toThrow(/competition page/);
  });
});
