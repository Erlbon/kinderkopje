import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import { Cube, addCapture, cleanHeading, emptyCube, isComplete, isScoringEvent, pageKind, queueByRace, queueStatus, readCompetitionEvents, readCompetitionList, readEventResults } from "../src/core";
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

describe("a competition page", () => {
  it("lists its events once each", () => {
    const html = `<a href="/iframe/EventResults/374263?competitionId=77536&disciplineId=10">General Classification</a><a href="/iframe/EventResults/374263?competitionId=77536&disciplineId=10">General Classification</a><a href="/iframe/EventResults/374264?competitionId=77536&disciplineId=10">Stage 1</a>`;
    expect(readCompetitionEvents(doc(html), "/iframe/CompetitionResults/77536")).toEqual({
      competitionId: 77536,
      events: [{ id: 374263, name: "General Classification" }, { id: 374264, name: "Stage 1" }],
    });
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
  });
  it("only the general classification and the stages count, not the jersey classifications", () => {
    for (const n of ["General Classification", "Stage 3", "Prologue", "Individual Time Trial"]) expect(isScoringEvent(n), n).toBe(true);
    for (const n of ["Points Classification", "Youth Classification", "Mountains Classification", "Teams Classification"]) expect(isScoringEvent(n), n).toBe(false);
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
