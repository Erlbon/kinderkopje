import { describe, expect, it } from "vitest";
import { Assignment, addCapture, addQueue, assignByRace, decodeAssignment, emptyCube, encodeAssignment } from "../src/core";

const a: Assignment = {
  v: 1,
  title: "Pelotonic: help collect UCI results (part 1 of 2)",
  note: "Send the file to Erlend on Discord, thanks! æøå",
  races: [
    { year: 2026, uciId: 78500, name: "Strade Bianche" },
    { year: 2025, uciId: 70500, name: "Strade Bianche" },
  ],
};

describe("work package link text", () => {
  it("round-trips, with non-English letters, in a form safe for an address", () => {
    const text = encodeAssignment(a);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAssignment(text)).toEqual(a);
  });
  it("refuses garbage and wrong kinds of packages with a readable message", () => {
    expect(() => decodeAssignment("not a package")).toThrow(/cannot be read/);
    const other = btoa(JSON.stringify({ hello: "world" })).replace(/=+$/, "");
    expect(() => decodeAssignment(other)).toThrow(/not a Pelotonic work package/);
    const empty = btoa(JSON.stringify({ v: 1, races: [] })).replace(/=+$/, "");
    expect(() => decodeAssignment(empty)).toThrow(/no races/);
  });
  it("drops race entries that are malformed, keeps the rest", () => {
    const mixed = btoa(JSON.stringify({ v: 1, races: [{ year: 2026, uciId: 1, name: "Ok" }, { year: "x" }, null] })).replace(/=+$/, "");
    expect(decodeAssignment(mixed).races).toEqual([{ year: 2026, uciId: 1, name: "Ok" }]);
  });
});

describe("dividing the queue between helpers", () => {
  const cube = emptyCube();
  const race = (uciId: number, name: string, start: string) => ({ uciId, name, start, end: start, country: "XXX" });
  addQueue(cube, "2026 UCI WorldTour", 2026, [race(2601, "Alpha Classic", "2026-03-01"), race(2602, "Beta Tour", "2026-03-02"), race(2603, "Gamma Race", "2026-03-03")]);
  addQueue(cube, "2025 UCI WorldTour", 2025, [race(2501, "Alpha Classic", "2025-03-01"), race(2502, "Beta Tour", "2025-03-02"), race(2503, "Gamma Race", "2025-03-03")]);
  addCapture(cube, {
    format: "racethreads-capture/1",
    raceResults: [{ uciId: 2501, year: 2025, name: "Alpha Classic", classifications: [{ label: "Final Classification", title: "x", totalRows: 3, rows: [{ rank: 1, rider: "R", team: "T", age: 20, nation: "XXX", result: "1:00", points: 10 }] }] }],
  });

  it("gives whole races to a helper, with all their editions", () => {
    const packages = assignByRace(cube, { racesPerHelper: 2 });
    expect(packages).toHaveLength(2);
    // alpha's 2025 edition is already captured, so only 2026 is left for it; beta has both
    expect(packages[0]!.races.map((r) => r.uciId)).toEqual([2601, 2602, 2502]);
    expect(packages[1]!.races.map((r) => r.uciId)).toEqual([2603, 2503]);
    expect(packages.map((p) => p.raceNames)).toEqual([["Alpha Classic", "Beta Tour"], ["Gamma Race"]]);
  });
  it("can include editions that are captured already, and limit to some years", () => {
    expect(assignByRace(cube, { onlyMissing: false, racesPerHelper: 10 })[0]!.races.map((r) => r.uciId)).toEqual([2601, 2501, 2602, 2502, 2603, 2503]);
    expect(assignByRace(cube, { years: [2025], racesPerHelper: 10 })[0]!.races.map((r) => r.uciId)).toEqual([2502, 2503]);
  });
  it("gives nothing when everything is captured", () => {
    const done = emptyCube();
    addQueue(done, "hub", 2026, [race(1, "Only", "2026-01-01")]);
    addCapture(done, { format: "racethreads-capture/1", raceResults: [{ uciId: 1, year: 2026, name: "Only", classifications: [{ label: "a", title: "b", totalRows: 1, rows: [{ rank: 1, rider: "R", team: "T", age: 1, nation: "X", result: "1", points: 1 }] }] }] });
    expect(assignByRace(done)).toEqual([]);
  });
});

describe("work package links (with compression)", () => {
  const many: Assignment = {
    v: 1,
    title: "Pelotonic: help collect UCI results (part 1 of 3)",
    note: "Send the file to Erlend on Discord, thanks!",
    races: Array.from({ length: 50 }, (_, i) => ({ year: 2021 + (i % 6), uciId: 70000 + i * 7, name: "Some Classic Race " + (i % 12) })),
  };
  it("round-trips and the compressed form is shorter for a big package", async () => {
    const { packAssignment, unpackAssignment } = await import("../src/web/assignment-link");
    const packed = await packAssignment(many);
    expect(packed.startsWith("z")).toBe(true);
    expect(packed.length).toBeLessThan(encodeAssignment(many).length);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await unpackAssignment(packed)).toEqual(many);
  });
  it("opens the plain form, with or without its prefix", async () => {
    const { unpackAssignment } = await import("../src/web/assignment-link");
    expect(await unpackAssignment("j" + encodeAssignment(a))).toEqual(a);
    expect(await unpackAssignment(encodeAssignment(a))).toEqual(a);
  });
  it("a damaged link gives a readable message, not a crash", async () => {
    const { unpackAssignment } = await import("../src/web/assignment-link");
    await expect(unpackAssignment("zAAAA")).rejects.toThrow(/cannot be read/);
    await expect(unpackAssignment("")).rejects.toThrow();
  });
});
