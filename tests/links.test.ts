import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import { COUNTRIES, CONTINENTS, addCapture, addToLinkStore, buildRaces, continentOf, countryOf, emptyCube, linkKey, linksFor, linksFromRegistry, mergeLinks, parseLinkStore, removeFromLinkStore } from "../src/core";
import { MIGRATIONS, openDatabase, saveCube, setKv, writeRaces } from "../src/db";
import { searchNames } from "../src/web/pages/race-links";

const SQL = await initSqlJs();

describe("countries and continents", () => {
  it("has every country once, each on a known continent and confederation", () => {
    expect(COUNTRIES).toHaveLength(150);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(150);
    for (const c of COUNTRIES) {
      expect(CONTINENTS, c.code).toContain(c.continent);
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.name.length).toBeGreaterThan(2);
    }
  });
  it("knows the continent of UCI's codes, including the awkward ones", () => {
    expect(continentOf("GER")).toBe("Europe");
    expect(continentOf("NED")).toBe("Europe");
    expect(continentOf("TUR")).toBe("Europe"); // UCI's European confederation
    expect(continentOf("ISR")).toBe("Europe");
    expect(continentOf("KAZ")).toBe("Asia");
    expect(continentOf("TPE")).toBe("Asia");
    expect(continentOf("CUR")).toBe("North America"); // the Caribbean
    expect(continentOf("CRC")).toBe("North America"); // Central America
    expect(continentOf("COL")).toBe("South America");
    expect(continentOf("GUM")).toBe("Oceania");
    expect(countryOf(" sui ")?.name).toBe("Switzerland");
    expect(countryOf("PAN")?.confederation).toBe("Pan America");
    expect(continentOf("XXX")).toBeUndefined();
    expect(continentOf("")).toBeUndefined();
    expect(continentOf(null)).toBeUndefined();
  });
  it("is a table in the database that can be joined to races, riders and teams", () => {
    const db = openDatabase(SQL);
    expect(db.exec("SELECT COUNT(*) FROM country")[0]!.values[0]![0]).toBe(150);
    expect(db.exec("SELECT continent FROM country WHERE code = 'BEL'")[0]!.values[0]![0]).toBe("Europe");
  });
  it("an older file gets the table when it is opened", () => {
    const old = new SQL.Database();
    for (let v = 1; v <= 4; v++) old.exec(MIGRATIONS[v]!);
    old.run("INSERT INTO meta(key, value) VALUES ('schema_version', '4')");
    const upgraded = openDatabase(SQL, old.export());
    expect(upgraded.exec("SELECT COUNT(*) FROM country")[0]!.values[0]![0]).toBe(150);
    expect(upgraded.exec("SELECT COUNT(*) FROM race_link")[0]!.values[0]![0]).toBe(0);
  });
});

describe("links of a race", () => {
  const REGISTRY = [
    "strade-bianche-me:",
    "  name: Strade Bianche",
    "  category: ME",
    "  officialSite: https://www.strade-bianche.it/en/",
    "  wikipedia: https://en.wikipedia.org/wiki/Strade_Bianche",
    "  pcs: strade-bianche",
    "  firstcycling: 54",
    "  social:",
    "    - { text: Instagram, url: \"https://www.instagram.com/strade_bianche\" }",
    "    - { text: Twitter, url: \"https://twitter.com/StradeBianche\" }",
    "    - { text: Strava, url: \"https://www.strava.com/clubs/strade\" }",
  ].join(String.fromCharCode(10));

  it("come from the race registry: site, Wikipedia, FirstCycling and the social media; the registry's pcs field does not become a link", () => {
    const store = linksFromRegistry(REGISTRY);
    const links = store[linkKey("Strade Bianche", "ME")]!;
    expect(links.map((l) => l.kind)).toEqual(["website", "wikipedia", "firstcycling", "instagram", "x", "other"]);
    expect(links.find((l) => l.kind === "firstcycling")!.url).toBe("https://firstcycling.com/race.php?r=54");
    expect(links.find((l) => l.kind === "other")).toMatchObject({ label: "Strava" });
    expect(JSON.stringify(store).toLowerCase()).not.toContain("procyclingstats");
    expect(links.every((l) => l.source === "registry")).toBe(true);
    expect(linksFromRegistry("not: [valid")).toEqual({});
    expect(linksFromRegistry(undefined)).toEqual({});
  });
  it("are merged without duplicates, whether the address is written with www, http, a slash or the old Twitter name", () => {
    const merged = mergeLinks(
      [{ kind: "x", url: "https://twitter.com/StradeBianche", source: "registry" }, { kind: "website", url: "https://www.strade-bianche.it/en/", source: "registry" }],
      [{ kind: "x", url: "https://x.com/stradebianche", source: "wikidata" }, { kind: "website", url: "http://strade-bianche.it/en", source: "wikidata" }, { kind: "instagram", url: "https://instagram.com/strade_bianche", source: "wikidata" }],
    );
    expect(merged.map((l) => l.kind)).toEqual(["x", "website", "instagram"]);
    expect(merged[0]!.source).toBe("registry"); // the first one wins
  });
  it("follow a race through a join and a rename: they are found under any of its names", () => {
    const comp = (id: number, name: string, year: number) => ({ id, name, start: year + "-03-01", end: year + "-03-01", year, country: "ITA", class: "1.UWT", inProgress: false, category: "ME" as const });
    const cube = emptyCube();
    addCapture(cube, { format: "racethreads-capture/1", competitions: [comp(1, "Classic Brugge-De Panne", 2024), comp(2, "Oxyclean Classic Brugge-De Panne", 2021)] });
    const store = addToLinkStore({}, linkKey("Oxyclean Classic Brugge-De Panne", "ME"), [{ kind: "website", url: "https://www.classicbruggedepanne.be", source: "manual" }]);
    const NL = String.fromCharCode(10);
    const joined = buildRaces(cube, "Oxyclean Classic Brugge-De Panne = Classic Brugge-De Panne", "", undefined, [store]);
    expect(joined).toHaveLength(1);
    expect(joined[0]!.links.map((l) => l.url)).toEqual(["https://www.classicbruggedepanne.be"]);
    const unjoined = buildRaces(cube, "", "", undefined, [store]);
    expect(unjoined.find((r) => r.name === "Classic Brugge-De Panne")!.links).toEqual([]); // not the same race until joined
    expect(linksFor({ name: "Other", category: "ME", names: [] }, store)).toEqual([]);
    expect(NL).toBe("\n");
  });
  it("are looked up under each name a race has had, best first, without repeats", () => {
    const race = { name: "Classic Brugge-De Panne", names: [{ name: "Oxyclean Classic Brugge-De Panne" }, { name: "MINERVA CLASSIC BRUGGE - DE PANNE" }, { name: "Classic Brugge-De Panne" }], category: "ME" as const } as never;
    expect(searchNames(race)).toEqual(["Classic Brugge-De Panne", "Oxyclean Classic Brugge-De Panne", "MINERVA CLASSIC BRUGGE - DE PANNE", "Brugge-De Panne"]);
    const vuelta = { name: "La Vuelta Ciclista a España", names: [{ name: "La Vuelta Ciclista a España" }], category: "ME" as const } as never;
    expect(searchNames(vuelta)).toEqual(["La Vuelta Ciclista a España", "Vuelta a España"]);
    const dash = { name: "Ronde van Vlaanderen - Tour des Flandres", names: [{ name: "Ronde van Vlaanderen - Tour des Flandres" }], category: "ME" as const } as never;
    expect(searchNames(dash)).toEqual(["Ronde van Vlaanderen - Tour des Flandres", "Ronde van Vlaanderen"]);
  });
  it("can be removed again, from every name they were stored under", () => {
    const key = linkKey("Some Race", "ME");
    const link = { kind: "instagram" as const, url: "https://www.instagram.com/some", source: "manual" as const };
    const store = addToLinkStore({}, key, [link]);
    expect(removeFromLinkStore(store, [key], { ...link, url: "https://instagram.com/some/" })).toEqual({});
    expect(parseLinkStore("not json")).toEqual({});
    expect(parseLinkStore(undefined)).toEqual({});
  });
  it("are written to the database for each race, from the registry and from what was stored", () => {
    const cube = emptyCube();
    const comp = (id: number, name: string, year: number) => ({ id, name, start: year + "-03-01", end: year + "-03-01", year, country: "ITA", class: "1.UWT", inProgress: false, category: "ME" as const });
    addCapture(cube, { format: "racethreads-capture/1", competitions: [comp(1, "Strade Bianche", 2025), comp(2, "Milano-Sanremo", 2025)] });
    const db = openDatabase(SQL);
    saveCube(db, cube);
    setKv(db, "registry", REGISTRY);
    setKv(db, "racelinks", JSON.stringify(addToLinkStore({}, linkKey("Milano-Sanremo", "ME"), [{ kind: "website", url: "http://www.milanosanremo.it/", source: "wikidata" }])));
    writeRaces(db, cube);
    const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];
    expect(rows("SELECT r.name, l.kind, l.source FROM race_link l JOIN race r ON r.race_id = l.race_id WHERE r.name = 'Milano-Sanremo'")).toEqual([["Milano-Sanremo", "website", "wikidata"]]);
    expect(rows("SELECT COUNT(*) FROM race_link l JOIN race r ON r.race_id = l.race_id WHERE r.name = 'Strade Bianche'")[0]![0]).toBe(6);
    expect(rows("SELECT label FROM race_link WHERE kind = 'x'")[0]![0]).toBe("X");
    expect(rows("SELECT COUNT(*) FROM race_link WHERE url LIKE '%procyclingstats%'")[0]![0]).toBe(0);
  });
});
