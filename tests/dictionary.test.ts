import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import { Cube, addCapture, addQueue, emptyCube, setLevels } from "../src/core";
import { DICTIONARY, dictionaryHtml, dictionaryJson, dictionaryMarkdown, openDatabase, querySql, saveCube } from "../src/db";

const SQL = await initSqlJs();
const db = openDatabase(SQL);

// the real schema, as SQLite reports it
const objects = db
  .exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]!
  .values.map((r) => ({ name: r[0] as string, type: r[1] as string }));
const columnsOf = (name: string) => db.exec("PRAGMA table_info(" + name + ")")[0]!.values.map((r) => r[1] as string);

describe("the data overview matches the real schema", () => {
  it("describes every table and view, and nothing that does not exist", () => {
    expect(DICTIONARY.map((d) => d.name).sort()).toEqual(objects.map((o) => o.name).sort());
    for (const o of objects) expect(DICTIONARY.find((d) => d.name === o.name)!.kind).toBe(o.type);
  });
  it("describes every column, in the real order, with a meaning", () => {
    for (const d of DICTIONARY) {
      expect(d.columns.map((c) => c.name), d.name).toEqual(columnsOf(d.name));
      for (const c of d.columns) expect(c.meaning.length, d.name + "." + c.name).toBeGreaterThan(5);
    }
  });
  it("has a summary and a runnable example for each", () => {
    // some data, so the examples have something to chew on
    const cube: Cube = emptyCube();
    cube.teamSnapshots.push({ date: "2026-10-13", season: 2026, momentId: 1, complete: false, teams: [{ teamId: 595, code: "UEX", name: "UAE TEAM EMIRATES XRG", nation: "UAE", rank: 1, points: 30329.1 }] });
    setLevels(cube, 2026, { WT: [595], PT: [] });
    addCapture(cube, { format: "racethreads-capture/1", raceResults: [{ uciId: 78462, year: 2026, name: "Paris - Tours Elite", classifications: [{ label: "Final Classification", title: "General Classification", totalRows: 165, rows: [{ rank: 1, rider: "Per Strand HAGENES", team: "TEAM VISMA | LEASE A BIKE", age: 23, nation: "NOR", result: "4:31:46", points: 250 }] }] }] });
    addQueue(cube, "2027 UCI WorldTour", 2027, [{ uciId: 79677, name: "Strade Bianche", start: "2027-03-06", end: "2027-03-06", country: "ITA" }]);
    saveCube(db, cube);
    for (const d of DICTIONARY) {
      expect(d.summary.length, d.name).toBeGreaterThan(10);
      expect(() => querySql(db, d.example.sql), d.name + " example").not.toThrow();
    }
    expect(querySql(db, DICTIONARY.find((d) => d.name === "v_team_points")!.example.sql).rows[0]![2]).toBe("UEX");
  });
});

describe("the overview as Markdown", () => {
  it("lists every table with a field table and an example", () => {
    const md = dictionaryMarkdown();
    for (const d of DICTIONARY) expect(md).toContain("## " + d.name);
    expect(md).toContain("|`team_id`|UCI's team number.");
    expect(md).toContain("```sql");
  });
});

describe("the overview as downloadable files", () => {
  it("HTML: a complete page with every table, a contents list and its sources, with nothing unescaped", () => {
    const html = dictionaryHtml(DICTIONARY, "v1 (test)");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    const doc = parseHTML(html).document;
    for (const d of DICTIONARY) {
      expect(doc.querySelector("h2#" + d.name), d.name).not.toBeNull();
      expect(doc.querySelector('a[href="#' + d.name + '"]'), d.name + " in contents").not.toBeNull();
    }
    expect(doc.querySelectorAll("h2").length).toBe(DICTIONARY.length);
    expect(html).toContain("UCI");
    expect(html).toContain("Wikipedia");
    expect(html).toContain("v1 (test)");
    expect(html).not.toMatch(/<script/i);
  });
  it("HTML escapes anything that looks like markup", () => {
    const odd = [{ name: "t", kind: "table" as const, summary: "a <b>bold</b> & more", columns: [{ name: "x", meaning: "1 < 2 && \"quoted\"" }], example: { title: "T", sql: "SELECT '<x>'" } }];
    const html = dictionaryHtml(odd);
    expect(html).toContain("a &lt;b&gt;bold&lt;/b&gt; &amp; more");
    expect(html).toContain("1 &lt; 2 &amp;&amp; &quot;quoted&quot;");
    expect(html).not.toContain("<b>bold</b>");
  });
  it("JSON: lists the tables and reads back", () => {
    const j = JSON.parse(dictionaryJson(DICTIONARY, "v1"));
    expect(j.tables.map((t: { name: string }) => t.name)).toEqual(DICTIONARY.map((d) => d.name));
    expect(j.version).toBe("v1");
  });
});
