import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { raceIdFromUrl, readOpenResults, readRaceFacts, spacedText } from "../src/core";

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
