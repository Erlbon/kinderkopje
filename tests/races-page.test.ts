import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { addCapture, emptyCube } from "../src/core";
import { initRaces } from "../src/web/pages/races";
import type { Store } from "../src/web/store";

// the real page, with a queue of four races: one finished, one not, one in a class the filter leaves out, one women's
function page(): { doc: Document; text: () => string } {
  const html = readFileSync(new URL("../src/site/races.html", import.meta.url), "utf8");
  const { document } = parseHTML(html);
  (globalThis as unknown as { document: Document }).document = document as unknown as Document;
  const doc = document as unknown as Document;
  // a browser starts these ticked (checked in the HTML); the test DOM does not read that attribute
  for (const id of ["queuemissing", "queuetop"]) (doc.getElementById(id) as HTMLInputElement).checked = true;

  const cube = emptyCube();
  const comp = (id: number, name: string, cls: string, category: "ME" | "WE" = "ME") => ({ id, name, start: "2026-04-05", end: "2026-04-05", year: 2026, country: "BEL", class: cls, inProgress: false, category });
  addCapture(cube, { format: "racethreads-capture/1", competitions: [comp(1, "Finished Classic", "1.UWT"), comp(2, "Waiting Classic", "1.Pro"), comp(3, "Small Race", "1.2"), comp(4, "Women's Classic", "1.WWT", "WE")] });
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, rider: "R" + i, team: "T", age: 25, nation: "BEL", result: "x", points: 5 }));
  // race 1: the table ended on a short page; race 2: a full page of scoring rows, the next page not read
  addCapture(cube, { format: "racethreads-capture/1", eventResults: [{ competitionId: 1, eventId: 11, heading: "x", totalRows: 20, rows: rows(20) }, { competitionId: 2, eventId: 22, heading: "x", totalRows: 40, rows: rows(40) }] });

  const store = { cube, onChange: () => undefined, saveCube: async () => undefined, getText: () => undefined, setText: async () => undefined } as unknown as Store;
  initRaces(store);
  return { doc, text: () => doc.getElementById("queueout")!.textContent ?? "" };
}

describe("races whose names changed", () => {
  it("are joined on the page, and the page says so", () => {
    const html = readFileSync(new URL("../src/site/races.html", import.meta.url), "utf8");
    const { document } = parseHTML(html);
    (globalThis as unknown as { document: Document }).document = document as unknown as Document;
    const doc = document as unknown as Document;
    for (const id of ["queuemissing", "queuetop"]) (doc.getElementById(id) as HTMLInputElement).checked = false;
    const cube = emptyCube();
    const comp = (id: number, name: string, year: number) => ({ id, name, start: year + "-06-01", end: year + "-06-01", year, country: "FRA", class: "1.1", inProgress: false, category: "ME" as const });
    addCapture(cube, { format: "racethreads-capture/1", competitions: [comp(1, "Boucles de la Mayenne", 2026), comp(2, "Boucles de la Mayenne - Crédit Mutuel", 2025)] });
    const store = { cube, onChange: () => undefined, saveCube: async () => undefined, getText: () => undefined, setText: async () => undefined } as unknown as Store;
    initRaces(store);
    const rows = Array.from(doc.querySelectorAll("#queueout table tr")).filter((r) => (r.textContent ?? "").includes("Mayenne"));
    expect(rows).toHaveLength(1);
    expect(doc.getElementById("mergednote")!.textContent).toContain("Joined: ");
  });
});

describe("men's and women's races", () => {
  it("shows men's elite by default and says how many women's races are hidden", () => {
    const { text, doc } = page();
    const chosen = Array.from((doc.getElementById("queuecat") as HTMLSelectElement).options).find((o) => o.selected || o.hasAttribute("selected"));
    expect(chosen?.value ?? "ME").toBe("ME");
    expect(text()).toContain("Waiting Classic");
    expect(text()).not.toContain("Women's Classic");
    expect(text()).toContain("1 women's race hidden");
  });
  it("shows the women's races when asked, labelled as women's", () => {
    const { text, doc } = page();
    const sel = doc.getElementById("queuecat") as HTMLSelectElement;
    for (const o of Array.from(sel.options)) o.toggleAttribute("selected", false);
    const women = Array.from(sel.options).find((o) => o.value === "WE")!;
    women.selected = true;
    women.toggleAttribute("selected", true);
    sel.onchange!(new Event("change"));
    expect(text()).toContain("Women's Classic (women elite)");
    expect(text()).not.toContain("Waiting Classic");
  });
});

describe("the race queue page", () => {
  it("lists the unfinished race, and says how many finished and how many other-class races are hidden", () => {
    const { text } = page();
    expect(text()).toContain("Waiting Classic");
    expect(text()).not.toContain("Finished Classic");
    expect(text()).not.toContain("Small Race");
    expect(text()).toContain("1 finished race hidden");
    expect(text()).toContain("1 race in other classes hidden");
  });
  it("the Show them button next to the note shows the hidden races", () => {
    const { doc, text } = page();
    const show = Array.from(doc.querySelectorAll("#queueout button")).find((b) => b.textContent === "Show them") as HTMLButtonElement;
    show.click();
    expect(text()).toContain("Finished Classic");
    expect((doc.getElementById("queuemissing") as HTMLInputElement).checked).toBe(false);
  });
  it("shows the finished race when the filter is switched off", () => {
    const { doc, text } = page();
    (doc.getElementById("queuemissing") as HTMLInputElement).checked = false;
    doc.getElementById("queuemissing")!.onchange!(new Event("change"));
    expect(text()).toContain("Finished Classic");
    expect(text()).not.toContain("finished race hidden");
    expect(text()).toContain("1/1 events");
  });
});
