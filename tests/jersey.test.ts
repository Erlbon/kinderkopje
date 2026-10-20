import { describe, expect, it } from "vitest";
import { eventPagePath, jerseyKind, missingJerseyEvents } from "../src/core";

describe("the jersey pages that pay points", () => {
  it("tells the leader pages and the final points and mountain pages from everything else", () => {
    expect(jerseyKind("Stage 5: Stage General Classification")).toBe("leader");
    expect(jerseyKind("Final Classification: Points Classification")).toBe("final");
    expect(jerseyKind("Final Classification: Mountain Classification")).toBe("final");
    expect(jerseyKind("Final Classification: Mountains Classification")).toBe("final");
    for (const n of ["Stage 5: Stage Classification", "Stage 5: Stage Points Classification", "Stage 5: Overall Points Classification", "Stage 5: Stage Youth Classification", "Final Classification: General Classification", "Final Classification: Youth Classification", "General Classification"]) {
      expect(jerseyKind(n), n).toBeUndefined();
    }
  });

  const events = [
    { id: 1, name: "Stage 1: Stage Classification" },
    { id: 12, name: "Stage 12: Stage General Classification" },
    { id: 2, name: "Stage 2: Stage General Classification" },
    { id: 3, name: "Stage 1: Stage General Classification" },
    { id: 9, name: "Final Classification: Points Classification" },
    { id: 10, name: "Final Classification: Mountain Classification" },
    { id: 11, name: "Final Classification: Youth Classification" },
  ];

  it("lists only the pages not captured yet, leaders in stage order", () => {
    const m = missingJerseyEvents(events, [2]);
    expect(m.results.map((e) => e.id)).toEqual([1]);
    expect(m.leader.map((e) => e.id)).toEqual([3, 12]);
    expect(m.final.map((e) => e.id)).toEqual([10, 9]);
  });

  it("lists nothing when every page is captured, whether or not it scored", () => {
    const m = missingJerseyEvents(events, [2, 3, 12, 9, 10]);
    expect(m.leader).toEqual([]);
    expect(m.final).toEqual([]);
  });

  it("builds the address the competition page itself links to", () => {
    expect(eventPagePath(76406, 366957)).toBe("/iframe/EventResults/366957?competitionId=76406&disciplineId=10");
  });
});
