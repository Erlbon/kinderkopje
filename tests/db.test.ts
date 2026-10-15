import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import { Cube, addCapture, addQueue, emptyCube, CaptureFile, setLevels } from "../src/core";
import { SCHEMA_VERSION, deleteKv, getKv, loadCube, openDatabase, querySql, saveCube, schemaVersion, setKv } from "../src/db";

const SQL = await initSqlJs();

// A cube with a bit of everything. Teams and riders are made up; the structure is what is tested.
function sampleCube(): Cube {
  const cube = emptyCube();
  const t = (teamId: number, code: string, name: string, rank: number, points: number) => ({ teamId, code, name, nation: "XXX", rank, points });
  cube.teamSnapshots.push(
    { date: "2025-10-19", season: 2025, momentId: 1, complete: false, teams: [t(1, "AAA", "Team A", 1, 900.5), t(2, "BBB", "Team B", 2, 400)] },
    { date: "2026-10-13", season: 2026, momentId: 2, complete: true, teams: [t(1, "AAB", "Team A New", 1, 700)] },
  );
  setLevels(cube, 2026, { WT: [1], PT: [] });
  setLevels(cube, 2025, { WT: [1], PT: [2] });
  const file: CaptureFile = {
    format: "racethreads-capture/1",
    raceResults: [
      {
        uciId: 78462,
        year: 2026,
        name: "Paris - Tours Elite",
        class: "1.Pro",
        classText: "1.Pro - 1 day - UCI ProSeries",
        dates: "11 Oct 2026",
        classifications: [
          {
            label: "Final Classification",
            title: "General Classification",
            totalRows: 165,
            rows: [
              { rank: 1, rider: "Per Strand HAGENES", team: "TEAM VISMA | LEASE A BIKE", age: 23, nation: "NOR", result: "4:31:46", points: 250 },
              { rank: 2, rider: "Jasper STUYVEN", team: "SOUDAL QUICK-STEP", age: 34, nation: "BEL", result: "+02", points: 170 },
            ],
          },
        ],
      },
    ],
  };
  addCapture(cube, file);
  addQueue(cube, "2027 UCI WorldTour", 2027, [{ uciId: 79677, name: "Strade Bianche", start: "2027-03-06", end: "2027-03-06", country: "ITA" }]);
  return cube;
}

describe("database schema", () => {
  it("a new database is at the current schema version", () => {
    const db = openDatabase(SQL);
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]!.values.flat();
    expect(tables).toEqual(expect.arrayContaining(["team_snapshot", "team_rank", "team_level", "race_result", "classification", "result_row", "queue_race", "kv", "meta"]));
  });
  it("reopening a saved file keeps the data and does not migrate twice", () => {
    const db = openDatabase(SQL);
    setKv(db, "season", "season: 2027");
    const again = openDatabase(SQL, db.export());
    expect(getKv(again, "season")).toBe("season: 2027");
    expect(schemaVersion(again)).toBe(SCHEMA_VERSION);
  });
  it("refuses a file from a newer version of the tool", () => {
    const db = openDatabase(SQL);
    db.run("UPDATE meta SET value = '999' WHERE key = 'schema_version'");
    expect(() => openDatabase(SQL, db.export())).toThrow(/newer version/);
  });
});

describe("saving and loading the cube", () => {
  it("everything survives a round trip through SQLite and through an exported file", () => {
    const cube = sampleCube();
    const db = openDatabase(SQL);
    saveCube(db, cube);
    expect(loadCube(db)).toEqual(cube);
    const copy = openDatabase(SQL, db.export()); // the .sqlite file a moderator would pass on
    expect(loadCube(copy)).toEqual(cube);
  });
  it("saving again replaces the old rows (no duplicates)", () => {
    const db = openDatabase(SQL);
    const cube = sampleCube();
    saveCube(db, cube);
    saveCube(db, cube);
    expect(db.exec("SELECT count(*) FROM team_snapshot")[0]!.values[0]![0]).toBe(2);
    expect(db.exec("SELECT count(*) FROM result_row")[0]!.values[0]![0]).toBe(2);
  });
  it("an empty cube loads as an empty cube", () => {
    const db = openDatabase(SQL);
    expect(loadCube(db)).toEqual({ teamSnapshots: [] });
  });
});

describe("settings texts", () => {
  it("stores, reads, replaces and deletes", () => {
    const db = openDatabase(SQL);
    expect(getKv(db, "registry")).toBeUndefined();
    setKv(db, "registry", "a: 1");
    setKv(db, "registry", "a: 2");
    expect(getKv(db, "registry")).toBe("a: 2");
    deleteKv(db, "registry");
    expect(getKv(db, "registry")).toBeUndefined();
  });
});

describe("the SQL box", () => {
  const db = openDatabase(SQL);
  saveCube(db, sampleCube());
  it("answers questions with the views", () => {
    const r = querySql(db, "SELECT team_id, code, points FROM v_team_points WHERE season = 2026");
    expect(r.columns).toEqual(["team_id", "code", "points"]);
    expect(r.rows).toEqual([[1, "AAB", 700]]);
    const pts = querySql(db, "SELECT team, SUM(points) AS p FROM v_results GROUP BY team ORDER BY p DESC");
    expect(pts.rows[0]).toEqual(["TEAM VISMA | LEASE A BIKE", 250]);
  });
  it("matches the same team across a code change by the UCI id", () => {
    const r = querySql(db, "SELECT team_id, group_concat(code) FROM v_team_points GROUP BY team_id HAVING team_id = 1");
    expect(r.rows).toEqual([[1, "AAA,AAB"]]);
  });
  it("refuses anything that writes, also behind a second statement", () => {
    expect(() => querySql(db, "DELETE FROM team_rank")).toThrow(/Only SELECT/);
    expect(() => querySql(db, "SELECT 1; DELETE FROM team_rank")).toThrow();
    expect(db.exec("SELECT count(*) FROM team_rank")[0]!.values[0]![0]).toBe(3);
    // and the database accepts writes again afterwards
    setKv(db, "k", "v");
    expect(getKv(db, "k")).toBe("v");
  });
});

describe("upgrading an older database", () => {
  it("a version 1 file opens, keeps its data and gains the contributor column", async () => {
    const { MIGRATIONS } = await import("../src/db");
    const old = new SQL.Database();
    old.exec(MIGRATIONS[1]!);
    old.run("INSERT INTO meta(key, value) VALUES ('schema_version', '1')");
    old.run("INSERT INTO race_result(uci_id, year, name) VALUES (78462, 2026, 'Paris - Tours Elite')");
    old.run("INSERT INTO kv(key, value) VALUES ('season', 'season: 2026')");
    expect(schemaVersion(old)).toBe(1);

    const upgraded = openDatabase(SQL, old.export());
    expect(schemaVersion(upgraded)).toBe(2);
    expect(getKv(upgraded, "season")).toBe("season: 2026");
    const cube = loadCube(upgraded);
    expect(cube.raceResults![0]).toMatchObject({ uciId: 78462, name: "Paris - Tours Elite" });
    expect(cube.raceResults![0]!.contributor).toBeUndefined();
  });
  it("the contributor of a race result is kept", () => {
    const cube = emptyCube();
    cube.raceResults = [{ uciId: 1, year: 2026, name: "Some Race", contributor: "A Helper", classifications: [] }];
    const db = openDatabase(SQL);
    saveCube(db, cube);
    expect(loadCube(db).raceResults![0]!.contributor).toBe("A Helper");
  });
});
