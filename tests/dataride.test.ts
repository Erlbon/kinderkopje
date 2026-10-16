import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import { Cube, addCapture, parseRaceAliases, suggestJoins, categoryFromFilter, cleanHeading, emptyCube, isComplete, isOtherCategory, isScoringEvent, mergeEvents, pageKind, queueByRace, queueStatus, readCompetitionEvents, readCompetitionList, readEventResults } from "../src/core";
import { loadCube, openDatabase, saveCube } from "../src/db";

const doc = (html: string) => parseHTML(html).document as unknown as Document;
const SQL = await initSqlJs();

// markup copied from the real DataRide pages (three rows each)
const LIST = `<html><body><table><thead><tr><th>Date</th><th>Competition</th><th>Country</th><th>Class</th></tr></thead><tbody>
<tr class="k-master-row" role="row"><td role="gridcell">14 Oct 2026</td><td role="gridcell"><a class="uci-competition-link" href="/iframe/CompetitionResults/77536?disciplineId=10">Giro del Veneto</a><span class="label uci-small-label false"></span></td><td role="gridcell"><div class="f32" style="display: flex"><div class="flag it"></div><div style="padding-left:37px;">ITA</div></div></td><td role="gridcell">1.Pro</td></tr>
<tr class="k-alt k-master-row" role="row"><td role="gridcell">14 Oct 2026</td><td role="gridcell"><a class="uci-competition-link" href="/iframe/CompetitionResults/77867?disciplineId=10">Veneto Women</a><span class="label uci-small-label false"></span></td><td role="gridcell"><div class="f32"><div class="flag it"></div><div>ITA</div></div></td><td role="gridcell">1.1</td></tr>
<tr class="k-master-row" role="row"><td role="gridcell">13 Oct-18 Oct 2026</td><td role="gridcell"><a class="uci-competition-link" href="/iframe/CompetitionResults/76415?disciplineId=10">Tour of Guangxi</a><span class="label uci-small-label true">IN PROGRESS</span></td><td role="gridcell"><div class="f32"><div class="flag cn"></div><div>CHN</div></div></td><td role="gridcell">2.UWT</td></tr>
</tbody></table></body></html>`;

const point = (n: string) => `<td class="points" role="gridcell"><span class="uci-points-left">${n}</span><span class="uci-points-right"></span></td>`;
const row = (rank: number, bib: number, rider: string, nation: string, team: string, age: number, result: string, pts: string) =>
  `<tr class="k-master-row" role="row"><td class="text-right">${rank}</td><td class="text-right">${bib}</td><td>${rider}</td><td><div class="f32"><div class="flag x"></div><div style="padding-left:37px;">${nation} </div></div></td><td>${team}</td><td>${age}</td><td>${result}</td><td></td>${point(pts)}</tr>`;
const EVENT = `<html><body><div>IFrame Giro del Veneto Individual Road Race - 14 Oct 2026 Results</div><table><thead><tr><th>Rank</th><th>BIB</th><th>Rider</th><th>Nation</th><th>Team</th><th>Age</th><th>Result</th><th>IRM</th><th>Points</th></tr></thead><tbody>
${row(1, 51, "SEIXAS Paul", "FRA", "DECATHLON CMA CGM TEAM", 20, "5:49:28", "800")}
${row(2, 111, "MAS Enric", "ESP", "MOVISTAR TEAM", 31, "00:00:48", "640")}
${row(3, 81, "CICCONE Giulio", "ITA", "LIDL-TREK", 32, "00:01:05", "520")}
${row(51, 5, "NOBODY Some", "BEL", "SOME TEAM", 25, "00:09:00", "")}
</tbody></table></body></html>`;

describe("which DataRide page is it", () => {
  it("tells the three kinds apart", () => {
    expect(pageKind("/iframe/Results/10/")).toBe("list");
    expect(pageKind("/iframe/CompetitionResults/77536")).toBe("competition");
    expect(pageKind("/iframe/EventResults/374263")).toBe("event");
    expect(pageKind("/competition-details/2026/ROA/78468")).toBeUndefined();
  });
});

describe("the competition list", () => {
  const list = readCompetitionList(doc(LIST));
  it("reads id, name, dates, country and class", () => {
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ id: 77536, name: "Giro del Veneto", start: "2026-10-14", end: "2026-10-14", year: 2026, country: "ITA", class: "1.Pro", inProgress: false });
    expect(list[2]).toMatchObject({ id: 76415, start: "2026-10-13", end: "2026-10-18", class: "2.UWT", inProgress: true });
  });
  it("tells women's races from the name, or from the page's Category filter", () => {
    expect(list[0]!.category).toBe("ME");
    expect(list[1]!.category).toBe("WE");
    expect(readCompetitionList(doc(LIST), "Women Elite")[0]!.category).toBe("WE");
  });
});

describe("the categories", () => {
  it("only men's and women's elite are collected", () => {
    expect(categoryFromFilter("Men Elite")).toBe("ME");
    expect(categoryFromFilter("Women Elite")).toBe("WE");
    for (const other of ["Men Under 23", "Women Under 23", "Men Junior", "Women Junior", "All", ""]) expect(categoryFromFilter(other), other).toBeUndefined();
    expect(isOtherCategory("Men Under 23")).toBe(true);
    expect(isOtherCategory("Women Junior")).toBe(true);
    expect(isOtherCategory("Men Elite")).toBe(false);
    expect(isOtherCategory("")).toBe(false);
  });
  it("a list captured under the Category filter keeps its category, whatever the race is called", () => {
    const men = readCompetitionList(doc(LIST), "Men Elite");
    expect(men.every((c) => c.category === "ME")).toBe(true);
    const women = readCompetitionList(doc(LIST), "Women Elite");
    expect(women.every((c) => c.category === "WE")).toBe(true);
  });
  it("the import says how many of each came in", () => {
    const cube = emptyCube();
    const r = addCapture(cube, { format: "racethreads-capture/1", competitions: [...readCompetitionList(doc(LIST), "Men Elite"), ...readCompetitionList(doc(LIST).documentElement.ownerDocument, "Women Elite").map((c) => ({ ...c, id: c.id + 1000 }))] });
    expect(r.categories).toEqual({ "Men elite": 3, "Women elite": 3 });
  });
});

describe("a competition page", () => {
  const link = (id: number, name: string) => `<tr class="k-master-row"><td><a href="/iframe/EventResults/${id}?competitionId=77382&disciplineId=10">${name}</a></td><td>CHRISTEN Jan</td></tr>`;
  const stage = (name: string, links: string) =>
    `<tr class="k-master-row"><td class="k-hierarchy-cell"></td><td>${name}</td><td>31 Jan 2026</td><td>Men Elite</td></tr><tr class="k-detail-row"><td colspan="4"><table><tbody>${links}</tbody></table></td></tr>`;
  const page = (rows: string) => `<table><tbody>${rows}</tbody></table>`;

  it("names each event after the stage row it sits under, so the stages do not look alike", () => {
    const html = page(
      stage("Stage 5", link(371486, "Stage Points Classification") + link(372678, "Stage Classification") + link(372786, "Stage Youth Classification")) +
        stage("Stage 4", link(369277, "Stage Classification")),
    );
    const r = readCompetitionEvents(doc(html), "/iframe/CompetitionResults/77382")!;
    expect(r.events.map((e) => e.name)).toEqual([
      "Stage 5: Stage Points Classification",
      "Stage 5: Stage Classification",
      "Stage 5: Stage Youth Classification",
      "Stage 4: Stage Classification",
    ]);
    expect(r.events.filter((e) => isScoringEvent(e.name)).map((e) => e.id)).toEqual([372678, 369277]);
  });
  it("a one-day race links to its event directly", () => {
    const html = `<a href="/iframe/EventResults/374263?competitionId=77536&disciplineId=10">General Classification</a><a href="/iframe/EventResults/374263?competitionId=77536&disciplineId=10">General Classification</a>`;
    expect(readCompetitionEvents(doc(html), "/iframe/CompetitionResults/77536")!.events).toEqual([{ id: 374263, name: "General Classification" }]);
  });
  it("events seen in several presses add up", () => {
    const one = [{ id: 2, name: "Stage 2: Stage Classification" }];
    const two = [{ id: 1, name: "Stage 1: Stage Classification" }, { id: 2, name: "Stage 2: Stage Classification" }];
    expect(mergeEvents(one, two).map((e) => e.id)).toEqual([1, 2]);
    const cube = emptyCube();
    addCapture(cube, { format: "racethreads-capture/1", competitionEvents: [{ competitionId: 5, events: one }] });
    addCapture(cube, { format: "racethreads-capture/1", competitionEvents: [{ competitionId: 5, events: [{ id: 3, name: "Final Classification: General Classification" }] }] });
    expect(cube.queue!.find((q) => q.uciId === 5)!.events!.map((e) => e.id)).toEqual([2, 3]);
  });
});

describe("an event page", () => {
  const r = readEventResults(doc(EVENT), "/iframe/EventResults/374263", "?competitionId=77536&disciplineId=10")!;
  it("keeps only the rows that score points, with every field", () => {
    expect(r).toMatchObject({ competitionId: 77536, eventId: 374263, totalRows: 51, date: "2026-10-14", heading: "Giro del Veneto Individual Road Race" });
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({ rank: 1, rider: "SEIXAS Paul", team: "DECATHLON CMA CGM TEAM", age: 20, nation: "FRA", result: "5:49:28", points: 800 });
  });
  it("reads the heading without the page's scripts", () => {
    const withScript = EVENT.replace("<body>", "<body><script>$(document).on('keydown', 'input', function(e) { if (e.which) { e.preventDefault(); } });</script>");
    expect(readEventResults(doc(withScript), "/iframe/EventResults/374263", "?competitionId=77536")!.heading).toBe("Giro del Veneto Individual Road Race");
    expect(cleanHeading("n', '.k-input', function(e) { x(); }); ADAC Cyclassics Individual Road Race")).toBe("ADAC Cyclassics Individual Road Race");
  });
  it("needs the event and competition in the address, and a result table", () => {
    expect(readEventResults(doc(EVENT), "/iframe/EventResults/374263", "")).toBeUndefined();
    expect(readEventResults(doc("<html><body>loading</body></html>"), "/iframe/EventResults/1", "?competitionId=2")).toBeUndefined();
  });
});

describe("when an event is complete", () => {
  it("is not complete while every row of the page scored: the next page may hold more points", () => {
    expect(isComplete({ rows: new Array(40).fill(0), totalRows: 40 })).toBe(false);
    expect(isComplete({ rows: new Array(40).fill(0), totalRows: 80 })).toBe(true); // the next page was read and went on past the last scoring row
    expect(isComplete({ rows: new Array(5).fill(0), totalRows: 40 })).toBe(true);
    expect(isComplete({ rows: new Array(58).fill(0), totalRows: 58 })).toBe(true); // 40 + a short last page, everyone scored: the table ended
    expect(isComplete({ rows: new Array(80).fill(0), totalRows: 80 })).toBe(false);
  });
  it("only the general classification and the stages count, not the jersey classifications", () => {
    for (const n of ["General Classification", "Stage 3", "Prologue", "Individual Time Trial"]) expect(isScoringEvent(n), n).toBe(true);
    for (const n of ["Points Classification", "Youth Classification", "Mountains Classification", "Teams Classification"]) expect(isScoringEvent(n), n).toBe(false);
  });
});

describe("the same race under different names", () => {
  const comp = (id: number, name: string, year: number, category: "ME" | "WE" = "ME") => ({ id, name, start: year + "-06-01", end: year + "-06-01", year, country: "FRA", class: "1.1", inProgress: false, category });
  const queue = (...c: ReturnType<typeof comp>[]) => {
    const cube = emptyCube();
    addCapture(cube, { format: "racethreads-capture/1", competitions: c });
    return cube;
  };

  it("suggests joining a race that gained a sponsor in its name, but joins nothing by itself", () => {
    const cube = queue(comp(1, "Boucles de la Mayenne", 2026), comp(2, "Boucles de la Mayenne", 2025), comp(3, "Boucles de la Mayenne - Crédit Mutuel", 2024), comp(4, "Boucles de la Mayenne - Crédit Mutuel", 2023));
    expect(queueByRace(cube).races).toHaveLength(2); // nothing joined without a decision
    const found = suggestJoins(cube);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ fromYears: [2025, 2026], intoYears: [2023, 2024], category: "ME" });
    // the names are the two as they were before the join, not the one name after it
    expect(found[0]).toMatchObject({ fromName: "Boucles de la Mayenne", intoName: "Boucles de la Mayenne - Crédit Mutuel" });
    // accepting writes an alias line; with it the two are one race, with every year, under the newest name
    const line = found[0]!.from + " = " + found[0]!.into;
    const { races } = queueByRace(cube, line);
    expect(races).toHaveLength(1);
    expect(Object.keys(races[0]!.editions).sort()).toEqual(["2023", "2024", "2025", "2026"]);
    expect(races[0]!.name).toBe("Boucles de la Mayenne");
    // once accepted it is not suggested again, and a rejected pair stays rejected
    expect(suggestJoins(cube, line)).toHaveLength(0);
    expect(suggestJoins(cube, "", line)).toHaveLength(0);
  });
  it("keeps two races apart when both have an edition in the same year", () => {
    const cube = queue(comp(1, "Tour de Something Long", 2026), comp(2, "Tour de Something Long - Grand Prix", 2026));
    expect(suggestJoins(cube)).toHaveLength(0);
    expect(queueByRace(cube).races).toHaveLength(2);
  });
  it("does not join men's and women's races, or short names", () => {
    const cube = queue(comp(1, "Boucles de la Mayenne", 2026, "ME"), comp(2, "Boucles de la Mayenne - Crédit Mutuel", 2025, "WE"));
    expect(suggestJoins(cube)).toHaveLength(0);
    const short = queue(comp(3, "Giro", 2026), comp(4, "Giro del Veneto", 2025));
    expect(suggestJoins(short)).toHaveLength(0);
  });
  it("joins what an alias line says, and ignores an alias that would put two editions in one year", () => {
    const cube = queue(comp(1, "Kuurne Brussels Kuurne", 2026), comp(2, "Kuurne-Brussel-Kuurne", 2025), comp(3, "Omloop Nieuwsblad Old", 2026), comp(4, "Omloop Het Nieuwsblad Elite", 2025));
    const NL = String.fromCharCode(10);
    const aliases = ["# names that changed", "Omloop Nieuwsblad Old = Omloop Het Nieuwsblad Elite", "Kuurne Brussels Kuurne = Kuurne-Brussel-Kuurne"].join(NL);
    expect(queueByRace(cube, aliases).races).toHaveLength(2);
    expect(parseRaceAliases(["a = b", "", "# note", "no equals", " c=d "].join(NL))).toEqual([["a", "b"], ["c", "d"]]);
    const clash = queue(comp(5, "Race One", 2026), comp(6, "Race Two", 2026));
    expect(queueByRace(clash, "Race One = Race Two").races).toHaveLength(2);
  });
});

describe("DataRide captures in the cube", () => {
  function captured(): Cube {
    const cube = emptyCube();
    const list = readCompetitionList(doc(LIST));
    addCapture(cube, { format: "racethreads-capture/1", competitions: list });
    addCapture(cube, { format: "racethreads-capture/1", competitionEvents: [{ competitionId: 77536, events: [{ id: 374263, name: "General Classification" }] }] });
    const e = readEventResults(doc(EVENT), "/iframe/EventResults/374263", "?competitionId=77536&disciplineId=10")!;
    addCapture(cube, { format: "racethreads-capture/1", eventResults: [e] });
    return cube;
  }
  it("builds the queue, then ticks the event off", () => {
    const cube = captured();
    expect(cube.queue!.map((q) => q.name)).toContain("Giro del Veneto");
    const line = queueStatus(cube).find((l) => l.uciId === 77536)!;
    expect(line).toMatchObject({ class: "1.Pro", captured: true, rows: 3, eventsKnown: 1, eventsCaptured: 1, eventsComplete: 1 });
    const race = cube.raceResults![0]!;
    expect(race).toMatchObject({ uciId: 77536, year: 2026, name: "Giro del Veneto", class: "1.Pro" });
    expect(race.classifications[0]).toMatchObject({ label: "General Classification", eventId: 374263 });
  });
  it("a second page of the same event adds rows instead of replacing them", () => {
    const cube = captured();
    const next = { competitionId: 77536, eventId: 374263, heading: "x", totalRows: 40, rows: [{ rank: 41, rider: "LATE Rider", team: "T", age: 30, nation: "ITA", result: "x", points: 4 }] };
    addCapture(cube, { format: "racethreads-capture/1", eventResults: [next] });
    expect(cube.raceResults![0]!.classifications[0]!.rows.map((r) => r.rank)).toEqual([1, 2, 3, 41]);
  });
  it("a full page of scoring rows keeps the race open until the next page is captured", () => {
    const cube = emptyCube();
    addCapture(cube, { format: "racethreads-capture/1", competitions: readCompetitionList(doc(LIST)) });
    addCapture(cube, { format: "racethreads-capture/1", competitionEvents: [{ competitionId: 77536, events: [{ id: 1, name: "General Classification" }, { id: 2, name: "Points Classification" }] }] });
    const full = (from: number) => Array.from({ length: 40 }, (_, i) => ({ rank: from + i, rider: "R" + (from + i), team: "T", age: 25, nation: "ITA", result: "x", points: 5 }));
    addCapture(cube, { format: "racethreads-capture/1", eventResults: [{ competitionId: 77536, eventId: 1, heading: "x", totalRows: 40, rows: full(1) }] });
    expect(queueStatus(cube).find((l) => l.uciId === 77536)).toMatchObject({ eventsKnown: 1, eventsCaptured: 1, eventsComplete: 0 });
    addCapture(cube, { format: "racethreads-capture/1", eventResults: [{ competitionId: 77536, eventId: 1, heading: "x", totalRows: 80, rows: full(41).slice(0, 5) }] });
    expect(queueStatus(cube).find((l) => l.uciId === 77536)).toMatchObject({ eventsKnown: 1, eventsCaptured: 1, eventsComplete: 1 });
  });
  it("a one-day race needs no event list: its single event is enough", () => {
    const cube = emptyCube();
    addCapture(cube, { format: "racethreads-capture/1", competitions: readCompetitionList(doc(LIST)) });
    const e = readEventResults(doc(EVENT), "/iframe/EventResults/374263", "?competitionId=77536&disciplineId=10")!;
    addCapture(cube, { format: "racethreads-capture/1", eventResults: [e] });
    expect(queueStatus(cube).find((l) => l.uciId === 77536)).toMatchObject({ eventsKnown: 1, eventsComplete: 1 });
    // a stage race (several days) still waits for its event list
    const stage = { competitionId: 76415, eventId: 9, heading: "x", totalRows: 40, rows: [{ rank: 1, rider: "A", team: "T", age: 20, nation: "ITA", result: "x", points: 5 }] };
    addCapture(cube, { format: "racethreads-capture/1", eventResults: [stage] });
    expect(queueStatus(cube).find((l) => l.uciId === 76415)).toMatchObject({ eventsKnown: 0 });
  });
  it("results captured for events the competition page did not list still count", () => {
    const cube = emptyCube();
    addCapture(cube, { format: "racethreads-capture/1", competitions: readCompetitionList(doc(LIST)) });
    addCapture(cube, { format: "racethreads-capture/1", competitionEvents: [{ competitionId: 76415, events: [{ id: 1, name: "Stage 5: Stage Classification" }] }] });
    const e = (id: number, n: number) => ({ competitionId: 76415, eventId: id, heading: "Tour", totalRows: n + 10, rows: Array.from({ length: n }, (_, i) => ({ rank: i + 1, rider: "R" + i, team: "T", age: 20, nation: "ITA", result: "x", points: 5 })) });
    addCapture(cube, { format: "racethreads-capture/1", eventResults: [e(1, 5), e(2, 5), e(3, 5)] });
    expect(queueStatus(cube).find((l) => l.uciId === 76415)).toMatchObject({ eventsKnown: 3, eventsCaptured: 3, eventsComplete: 3 });
  });
  it("men's and women's races of the list stay apart in the queue by race", () => {
    const { races } = queueByRace(captured());
    expect(races.find((r) => r.name === "Veneto Women")!.category).toBe("WE");
    expect(races.find((r) => r.name === "Giro del Veneto")!.category).toBe("ME");
  });
  it("survives the database", () => {
    const db = openDatabase(SQL);
    saveCube(db, captured());
    const back = loadCube(db);
    expect(queueStatus(back).find((l) => l.uciId === 77536)).toMatchObject({ class: "1.Pro", eventsKnown: 1, eventsCaptured: 1 });
    expect(back.raceResults![0]!.classifications[0]!.eventId).toBe(374263);
  });
});
