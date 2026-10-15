import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CaptureFile,
  Cube,
  addCapture,
  compareToLastYear,
  comparisonMarkdown,
  emptyCube,
  monthlyMarkdown,
  monthlyOverview,
  sameDayInYear,
  snapshotAsOf,
} from "../src/core";

const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

describe("importing a capture file (real sample values)", () => {
  const cube = emptyCube();
  const report = addCapture(cube, JSON.parse(read("tests/fixtures/dataride-capture-sample.json")) as CaptureFile);

  it("adds the two team-ranking snapshots in date order", () => {
    expect(report).toEqual({ added: 2, replaced: 0, skipped: [] });
    expect(cube.teamSnapshots.map((s) => s.date)).toEqual(["2025-10-19", "2026-10-13"]);
  });
  it("keeps the same team across a code change (UAD in 2025, UEX in 2026)", () => {
    // as of 19 Oct: the 2026 ranking of 13 Oct against the 2025 ranking of 19 Oct
    const c = compareToLastYear(cube, 2026, "2026-10-19");
    const uae = c.lines.find((l) => l.teamId === 595)!;
    expect(uae).toMatchObject({ code: "UEX", now: 30329.1, before: 40637.65, diff: -10308.55 });
  });
  it("never uses a later ranking as 'the same date last year'", () => {
    // 13 Oct 2026 needs a 2025 ranking dated on or before 13 Oct 2025; the sample only has 19 Oct 2025
    const c = compareToLastYear(cube, 2026, "2026-10-13");
    expect(c.now?.date).toBe("2026-10-13");
    expect(c.before).toBeUndefined();
    expect(comparisonMarkdown(c, 2026, "2026-10-13")).toContain("compared with no ranking");
  });
});

describe("rules of the comparison", () => {
  it("takes the latest ranking on or before the cut-off, never a later one", () => {
    const cube: Cube = {
      teamSnapshots: [
        { date: "2025-10-05", season: 2025, momentId: 1, complete: true, teams: [] },
        { date: "2025-10-19", season: 2025, momentId: 2, complete: true, teams: [] },
      ],
    };
    expect(snapshotAsOf(cube, 2025, "2025-10-13")?.date).toBe("2025-10-05");
    expect(snapshotAsOf(cube, 2025, "2025-10-19")?.date).toBe("2025-10-19");
    expect(snapshotAsOf(cube, 2025, "2025-10-01")).toBeUndefined();
  });
  it("same day in another year, with 29 February handled", () => {
    expect(sameDayInYear("2026-10-13", 2025)).toBe("2025-10-13");
    expect(sameDayInYear("2028-02-29", 2027)).toBe("2027-02-28");
  });
});

// Synthetic teams: these numbers are made up to test the arithmetic, they are not UCI data.
describe("monthly overview (synthetic teams)", () => {
  const snap = (date: string, a: number, b?: number) => ({
    date,
    season: Number(date.slice(0, 4)),
    momentId: null,
    complete: true,
    teams: [
      { teamId: 1, code: "AAA", name: "Test Team A", nation: "XXX", rank: 1, points: a },
      ...(b === undefined ? [] : [{ teamId: 2, code: "BBB", name: "Test Team B", nation: "XXX", rank: 2, points: b }]),
    ],
  });
  const cube: Cube = {
    teamSnapshots: [
      snap("2025-01-31", 100, 50),
      snap("2025-02-28", 300, 70),
      snap("2025-03-31", 450, 90),
      snap("2026-01-31", 150, 40),
      snap("2026-02-28", 260, 100),
      // no March snapshot in 2026 yet
    ],
  };
  const lines = monthlyOverview(cube, 2026);
  const a = lines.find((l) => l.teamId === 1)!;

  it("month-end totals and points gained per month", () => {
    expect(a.total.slice(0, 3)).toEqual([150, 260, undefined]);
    expect(a.gained[0]).toBe(150);
    expect(a.gained[1]).toBe(110);
    expect(a.gainedBefore.slice(0, 3)).toEqual([100, 200, 150]);
  });
  it("months without a ranking stay empty (no invented numbers)", () => {
    expect(a.total[2]).toBeUndefined();
    expect(a.gained[2]).toBeUndefined();
  });
  it("a month after a gap is not given several months' points", () => {
    const gap: Cube = {
      teamSnapshots: [
        { date: "2026-02-28", season: 2026, momentId: null, complete: true, teams: [{ teamId: 1, code: "AAA", name: "Test Team A", nation: "XXX", rank: 1, points: 260 }] },
        { date: "2026-10-13", season: 2026, momentId: null, complete: true, teams: [{ teamId: 1, code: "AAA", name: "Test Team A", nation: "XXX", rank: 1, points: 950 }] },
      ],
    };
    const l = monthlyOverview(gap, 2026)[0]!;
    expect(l.total[9]).toBe(950);
    expect(l.gained[9]).toBeUndefined(); // September's ranking is missing
    expect(l.gained[1]).toBeUndefined(); // January's is missing
  });
  it("sorts by the latest total and renders markdown with last year in brackets", () => {
    expect(lines[0]!.teamId).toBe(1);
    const md = monthlyMarkdown(lines, 2026);
    expect(md).toContain("|Test Team A (AAA)|150 (+50)|110 (-90)|");
    expect(md).toContain("UCI World Ranking points");
  });
  it("season to date against last year as a table", () => {
    const c = compareToLastYear(cube, 2026, "2026-02-28");
    const t = c.lines.find((l) => l.teamId === 2)!;
    expect(t).toMatchObject({ now: 100, before: 70, diff: 30 });
    expect(comparisonMarkdown(c, 2026, "2026-02-28")).toContain("|Test Team B (BBB)|XXX|100|70|+30|");
  });
});

describe("importing the same date twice", () => {
  it("the newer capture replaces the older one", () => {
    const file = JSON.parse(read("tests/fixtures/dataride-capture-sample.json")) as CaptureFile;
    const cube = emptyCube();
    addCapture(cube, file);
    const again = addCapture(cube, file);
    expect(again).toMatchObject({ added: 0, replaced: 2 });
    expect(cube.teamSnapshots).toHaveLength(2);
  });
  it("refuses files that are not captures, and snapshots without a date", () => {
    expect(addCapture(emptyCube(), {} as CaptureFile).skipped[0]).toContain("not a racethreads capture file");
    const f = JSON.parse(read("tests/fixtures/dataride-capture-sample.json")) as CaptureFile;
    f.snapshots[0]!.date = "";
    expect(addCapture(emptyCube(), f).skipped[0]).toContain("no date");
  });
});
