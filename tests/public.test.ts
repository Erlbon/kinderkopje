import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import { addQueue, emptyCube } from "../src/core";
import { BETA_NOTE, PUBLIC_CREDITS, makePublicCopy, openDatabase, publicCredits, publicInfo, saveCube, setKv } from "../src/db";

const SQL = await initSqlJs();

function privateDb() {
  const db = openDatabase(SQL);
  const cube = emptyCube();
  cube.teamSnapshots.push({ season: 2025, date: "2025-12-31", momentId: 1, complete: true, teams: [{ teamId: 595, code: "TVL", name: "Team Visma | Lease a Bike", nation: "NED", rank: 1, points: 1000 }] });
  cube.raceResults = [
    {
      uciId: 78462,
      year: 2025,
      name: "Paris - Tours Elite",
      country: "FRA",
      capturedAt: "2026-10-01T10:00:00Z",
      contributor: "Secret Helper Name",
      classifications: [{ label: "Final Classification", title: "GC", totalRows: 1, rows: [{ rank: 1, rider: "Per Strand HAGENES", team: "TEAM VISMA", age: 23, nation: "NOR", result: "4:31:46", points: 250 }] }],
    },
  ];
  addQueue(cube, "hub", 2026, [{ uciId: 5, name: "Queued Race", start: "2026-03-01", end: "2026-03-01", country: "BEL" }]);
  saveCube(db, cube);
  setKv(db, "season-yaml", "private season text");
  return db;
}

describe("public copy", () => {
  it("keeps names, nations, points and race facts, and drops the private parts", () => {
    const db = privateDb();
    const bytes = makePublicCopy(SQL, db);
    const pub = openDatabase(SQL, bytes);
    const one = (sql: string) => pub.exec(sql)[0]?.values[0]?.[0];
    expect(one("SELECT COUNT(*) FROM team_rank")).toBe(1);
    expect(one("SELECT nation FROM team_rank")).toBe("NED");
    expect(one("SELECT nation FROM result_row")).toBe("NOR");
    expect(one("SELECT country FROM race_result")).toBe("FRA");
    expect(one("SELECT points FROM result_row")).toBe(250);
    expect(one("SELECT COUNT(*) FROM kv")).toBe(0);
    expect(one("SELECT COUNT(*) FROM queue_race")).toBe(0);
    expect(one("SELECT age FROM result_row")).toBe(23); // the rider's age is part of the public file
    expect(one("SELECT contributor FROM race_result")).toBeNull();
    expect(one("SELECT captured_at FROM race_result")).toBeNull();
    expect(publicCredits(pub)).toBe(PUBLIC_CREDITS);
    // the private text is gone from the file itself, not only from the tables
    const text = new TextDecoder("latin1").decode(bytes);
    for (const secret of ["Secret Helper Name", "private season text", "Queued Race", "2026-10-01T10"]) expect(text.includes(secret), secret).toBe(false);
  });
  it("keeps the races that have results, with their names, and leaves out races that are only in the queue", () => {
    const db = privateDb();
    const pub = openDatabase(SQL, makePublicCopy(SQL, db));
    const names = pub.exec("SELECT name FROM race")[0]?.values.map((v) => v[0]) ?? [];
    expect(names).toEqual(["Paris - Tours Elite"]);
    expect(pub.exec("SELECT COUNT(*) FROM race_name")[0]!.values[0]![0]).toBe(1);
    expect(pub.exec("SELECT race_id FROM result_row r JOIN classification c ON c.id = r.classification_id JOIN race_result q ON q.uci_id = c.uci_id")[0]!.values[0]![0]).not.toBeNull();
  });
  it("says it is a beta, when it was made and how much it holds, and the easy view shows the rider's age", () => {
    const db = privateDb();
    const pub = openDatabase(SQL, makePublicCopy(SQL, db, "Made in a test."));
    const info = publicInfo(pub);
    expect(info).toMatchObject({ beta: true, races: 1, editions: 1, results: 1, firstYear: 2025, lastYear: 2025 });
    expect(info.made).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    expect(info.note).toContain(BETA_NOTE);
    expect(info.note).toContain("Made in a test.");
    expect(pub.exec("SELECT race_name, rider, age FROM v_results")[0]!.values[0]).toEqual(["Paris - Tours Elite", "Per Strand HAGENES", 23]);
  });
  it("a file that is not a public copy says so", () => {
    expect(publicInfo(openDatabase(SQL))).toMatchObject({ beta: false, races: 0, editions: 0, results: 0 });
  });
  it("leaves the original untouched", () => {
    const db = privateDb();
    makePublicCopy(SQL, db);
    expect(db.exec("SELECT COUNT(*) FROM kv")[0]!.values[0]![0]).toBe(1);
    expect(db.exec("SELECT contributor FROM race_result")[0]!.values[0]![0]).toBe("Secret Helper Name");
  });
});
