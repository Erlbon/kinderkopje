import { describe, expect, it } from "vitest";
import { addCapture, ageByTeam, ageByYear, averageAge, buildRaces, displayName, emptyCube, fiveByFiveMarkdown, finalClassification, topRiders } from "../src/core";

const comp = (id: number, name: string, year: number) => ({ id, name, start: year + "-03-20", end: year + "-03-20", year, country: "ITA", class: "1.UWT", inProgress: false, category: "ME" as const });
const row = (rank: number, rider: string) => ({ rank, rider, team: "T", age: 28, nation: "NED", result: "x", points: 100 - rank });

describe("rider names", () => {
  it("turns UCI's SURNAME Given into the way r/peloton writes it", () => {
    expect(displayName("VAN DER POEL Mathieu")).toBe("Mathieu van der Poel");
    expect(displayName("POGAČAR Tadej")).toBe("Tadej Pogačar");
    expect(displayName("KRAGH ANDERSEN Søren")).toBe("Søren Kragh Andersen");
    expect(displayName("GROVES Kaden Alexander")).toBe("Kaden Alexander Groves");
    expect(displayName("MCNULTY Brandon")).toBe("Brandon McNulty");
    expect(displayName("VAN AERT Wout")).toBe("Wout van Aert");
    expect(displayName("ROCHE-JONES Mark")).toBe("Mark Roche-Jones");
    expect(displayName("Wout")).toBe("Wout"); // no clear split: left readable
  });
});

describe("the 5x5", () => {
  function cube() {
    const c = emptyCube();
    addCapture(c, { format: "racethreads-capture/1", competitions: [2021, 2022, 2023, 2024, 2025, 2026].map((y, i) => comp(i + 1, "Milano-Sanremo", y)) });
    const names = ["VAN DER POEL Mathieu", "POGAČAR Tadej", "GANNA Filippo", "VAN AERT Wout", "PHILIPSEN Jasper", "MATTHEWS Michael", "PEDERSEN Mads"];
    addCapture(c, {
      format: "racethreads-capture/1",
      eventResults: [2021, 2022, 2023, 2024, 2025, 2026].map((y, i) => ({
        competitionId: i + 1,
        eventId: 100 + i,
        heading: "x",
        totalRows: 80,
        rows: names.map((n, k) => row(k + 1, y === 2026 && k === 2 ? "PIDCOCK Tom" : n)).filter((r) => !(y === 2022 && r.rank === 4)), // 2022 has no 4th place in the data
      })),
    });
    return c;
  }

  it("takes the top five of the last five editions, newest first, and says which places are missing", () => {
    const c = cube();
    const race = buildRaces(c).find((r) => r.name === "Milano-Sanremo")!;
    const rows = topRiders(c, race);
    expect(rows.map((r) => r.year)).toEqual([2026, 2025, 2024, 2023, 2022]); // five editions, not six
    expect(rows[0]!.riders.map((w) => w.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0]!.riders[2]!.rider).toBe("PIDCOCK Tom");
    expect(rows[4]!.missing).toEqual([4]);
    expect(rows[0]!.missing).toEqual([]);
  });
  it("writes it as a Markdown table, with names as r/peloton writes them and a dash for a missing place", () => {
    const c = cube();
    const race = buildRaces(c).find((r) => r.name === "Milano-Sanremo")!;
    const md = fiveByFiveMarkdown(topRiders(c, race)).split(String.fromCharCode(10));
    expect(md[0]).toBe("| Year | 1st | 2nd | 3rd | 4th | 5th |");
    expect(md[1]).toBe("|---|:--|:--|:--|:--|:--|");
    expect(md[2]).toBe("| 2026 | Mathieu van der Poel | Tadej Pogačar | Tom Pidcock | Wout van Aert | Jasper Philipsen |");
    expect(md[6]).toBe("| 2022 | Mathieu van der Poel | Tadej Pogačar | Filippo Ganna | - | Jasper Philipsen |");
  });
  it("reads the final general classification of a stage race, not a stage or a jersey", () => {
    const cls = (label: string, rank: number) => ({ label, title: label, eventId: rank, totalRows: 40, rows: [row(1, "RIDER " + label)] });
    const picked = finalClassification([cls("Stage 1: Stage Classification", 1), cls("Final Classification: Points Classification", 2), cls("Final Classification: General Classification", 3)]);
    expect(picked?.label).toBe("Final Classification: General Classification");
    expect(finalClassification([cls("General Classification", 1)])?.label).toBe("General Classification"); // a one-day race
    expect(finalClassification([cls("Stage 1: Stage Classification", 1), cls("Stage 2: Stage Classification", 2)])).toBeUndefined();
  });
});

describe("average age", () => {
  const rowA = (rank: number, team: string, age: number | null) => ({ rank, rider: "R" + rank, team, age, nation: "NED", result: "x", points: 10 });
  function cube() {
    const c = emptyCube();
    const comp = (id: number, name: string, year: number, category: "ME" | "WE" = "ME") => ({ id, name, start: year + "-03-20", end: year + "-03-20", year, country: "ITA", class: "1.UWT", inProgress: false, category });
    addCapture(c, { format: "racethreads-capture/1", competitions: [comp(1, "Race One", 2025), comp(2, "Race Two", 2025), comp(3, "Race One", 2026), comp(4, "Women Race", 2025, "WE")] });
    const res = (competitionId: number, rows: ReturnType<typeof rowA>[]) => ({ competitionId, eventId: competitionId, heading: "x", totalRows: 80, rows });
    addCapture(c, {
      format: "racethreads-capture/1",
      eventResults: [
        res(1, [rowA(1, "Team A", 20), rowA(2, "Team A", 30), rowA(3, "Team B", 40)]),
        res(2, [rowA(1, "Team A", 22), rowA(2, "Team B", null)]), // an unknown age is not counted
        res(3, [rowA(1, "Team A", 34)]),
        res(4, [rowA(1, "Team W", 18)]),
      ],
    });
    return c;
  }

  it("averages the known ages and ignores a missing one", () => {
    expect(averageAge([{ age: 20 }, { age: 30 }, { age: null }])).toBe(25);
    expect(averageAge([{ age: null }])).toBeUndefined();
    expect(averageAge([])).toBeUndefined();
  });
  it("gives the average age of the point-scoring riders per year, men and women apart", () => {
    const men = ageByYear(cube(), "ME");
    expect(men.map((l) => l.label)).toEqual(["2025", "2026"]);
    expect(men[0]).toMatchObject({ riders: 4, races: 2, average: (20 + 30 + 40 + 22) / 4 });
    expect(men[1]).toMatchObject({ riders: 1, races: 1, average: 34 });
    expect(ageByYear(cube(), "WE")).toEqual([{ label: "2025", riders: 1, races: 1, average: 18 }]);
  });
  it("gives the average age per team in a year, youngest first, leaving out teams with too few results", () => {
    const teams = ageByTeam(cube(), 2025, "ME", 1);
    expect(teams.map((t) => [t.label, t.average])).toEqual([["Team A", (20 + 30 + 22) / 3], ["Team B", 40]]);
    expect(ageByTeam(cube(), 2025, "ME", 4)).toEqual([]); // nobody has four results
  });
});
