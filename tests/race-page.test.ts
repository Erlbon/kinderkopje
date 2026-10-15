import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { parseSavedRacePage, raceIdFromDocument, raceIdFromUrl, readOpenResults, readRaceFacts, spacedText } from "../src/core";

const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// linkedom stands in for the browser's DOMParser in these tests
const parse = (html: string) => parseHTML(html).document as unknown as Document;
const saved = read("tests/fixtures/saved-race-page.html");

describe("which race is a page", () => {
  it("reads the id and year from an address", () => {
    expect(raceIdFromUrl("https://www.uci.org/competition-details/2026/ROA/78462")).toEqual({ year: 2026, uciId: 78462 });
    expect(raceIdFromUrl("https://www.uci.org/discipline/road/abc")).toBeUndefined();
    expect(raceIdFromUrl(undefined)).toBeUndefined();
  });
  it("finds it in og:url of the saved page", () => {
    const noComment = saved.replace(/<!-- saved from url=.*? -->/, "");
    expect(raceIdFromDocument(parse(noComment))).toEqual({ year: 2026, uciId: 78462 });
  });
  it("falls back to the browser's 'saved from url' comment", () => {
    const noOg = saved.replace(/<meta property="og:url"[^>]*>/, "");
    expect(raceIdFromDocument(parse(noOg), noOg)).toEqual({ year: 2026, uciId: 78462 });
    expect(raceIdFromDocument(parse(noOg))).toBeUndefined(); // without the raw text there is nothing to read
  });
});

describe("race facts from the visible text", () => {
  const doc = parse(saved);
  it("puts a space between separate elements and ignores scripts", () => {
    const t = spacedText(doc.body);
    expect(t).toContain("Class 1.Pro - 1 day - UCI ProSeries");
    expect(spacedText(doc.documentElement)).not.toContain("never");
  });
  it("name, class and dates", () => {
    expect(readRaceFacts(doc)).toEqual({ name: "Paris - Tours Elite", class: "1.Pro", classText: "1.Pro - 1 day - UCI ProSeries", dates: "11 Oct 2026" });
  });
});

describe("the open results", () => {
  const { classifications, kept } = readOpenResults(parse(saved));
  it("keeps only the rows that score points, and says how many rows there were", () => {
    expect(kept).toBe(3);
    expect(classifications).toHaveLength(1);
    expect(classifications[0]).toMatchObject({ label: "Final Classification", title: "General Classification", totalRows: 5 });
  });
  it("reads rank, rider, team, age, nation, result and points", () => {
    expect(classifications[0]!.rows[0]).toEqual({ rank: 1, rider: "Per Strand HAGENES", team: "TEAM VISMA | LEASE A BIKE", age: 23, nation: "NOR", result: "4:31:46", points: 250 });
    expect(classifications[0]!.rows.map((r) => r.points)).toEqual([250, 170, 140]);
  });
});

describe("a saved race page as a whole", () => {
  it("becomes a race result", () => {
    const r = parseSavedRacePage(saved, parse);
    expect(r).toMatchObject({ uciId: 78462, year: 2026, name: "Paris - Tours Elite", class: "1.Pro", dates: "11 Oct 2026" });
    expect(r.classifications[0]!.rows).toHaveLength(3);
  });
  it("explains what is wrong when the results were not open", () => {
    const closed = saved.replace(/<div class="results-table ">[\s\S]*<\/table><\/div><\/div>/, "");
    expect(() => parseSavedRacePage(closed, parse)).toThrow(/open Final Classification/);
  });
  it("explains what is wrong when it is not a race page", () => {
    expect(() => parseSavedRacePage("<html><body>hello</body></html>", parse)).toThrow(/does not look like a UCI race page/);
  });
  it("explains what is wrong when nothing scored points", () => {
    const none = saved.replace(/<td class="responsive-table__cell">(250|170|140)<\/td>/g, '<td class="responsive-table__cell"></td>');
    expect(() => parseSavedRacePage(none, parse)).toThrow(/no rows that score points/);
  });
});
