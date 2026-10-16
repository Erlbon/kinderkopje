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

// a page with a small queue built from (name, year, class) lines, and a store that remembers what is saved
function pageWith(names: [string, number, string?, ("ME" | "WE")?][], beforeInit?: (doc: Document) => void) {
  const html = readFileSync(new URL("../src/site/races.html", import.meta.url), "utf8");
  const { document } = parseHTML(html);
  (globalThis as unknown as { document: Document }).document = document as unknown as Document;
  const doc = document as unknown as Document;
  for (const id of ["queuemissing", "queuetop"]) (doc.getElementById(id) as HTMLInputElement).checked = false;
  const cube = emptyCube();
  const comp = (id: number, name: string, year: number, cls = "1.1", category: "ME" | "WE" = "ME") => ({ id, name, start: year + "-06-01", end: year + "-06-01", year, country: "FRA", class: cls, inProgress: false, category });
  addCapture(cube, { format: "racethreads-capture/1", competitions: names.map(([n, y, c, k], i) => comp(i + 1, n, y, c, k)) });
  const texts = new Map<string, string>();
  const store = { cube, onChange: () => undefined, saveCube: async () => undefined, getText: (k: string) => texts.get(k), setText: async (k: string, v: string) => void texts.set(k, v) } as unknown as Store;
  beforeInit?.(doc);
  initRaces(store);
  const rows = () => Array.from(doc.querySelectorAll("#queueout table tr td:first-child")).map((c) => c.textContent ?? "").filter((t) => t.includes("Mayenne"));
  const button = (label: string) => Array.from(doc.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;
  return { doc, texts, rows, button };
}

describe("races whose names changed", () => {
  const MAYENNE: [string, number][] = [["Boucles de la Mayenne", 2026], ["Boucles de la Mayenne - Crédit Mutuel", 2025]];
  const choices = (doc: Document) => Array.from(doc.querySelectorAll("#joinreview td.seg button")) as HTMLButtonElement[];
  const choice = (doc: Document, label: string, row = 0) => choices(doc).filter((b) => b.textContent === label)[row]!;
  const save = (button: (l: string) => HTMLButtonElement) => (button("Save my decisions").onclick as () => Promise<void>)();

  it("stay two rows until you review, and the page says how many joins wait", () => {
    const { doc, rows } = pageWith(MAYENNE);
    expect(rows()).toHaveLength(2);
    expect(doc.getElementById("mergednote")!.textContent).toContain("1 possible join to review");
  });
  it("Find joins gives each pair three clear choices, and decides nothing until you do", () => {
    const { doc, button } = pageWith(MAYENNE);
    button("Find joins").click();
    expect(choices(doc).map((b) => b.textContent)).toEqual(["Same race", "Not the same", "Don't know"]);
    expect(choice(doc, "Don't know").classList.contains("on")).toBe(true); // nothing is decided yet
    expect(choice(doc, "Same race").classList.contains("on")).toBe(false);
    const cells = Array.from(doc.querySelectorAll("#joinreview tr:nth-child(2) td")).map((c) => c.textContent);
    expect(cells.slice(1)).toEqual(["Boucles de la Mayenne - Crédit Mutuel", "1.1 Boucles de la Mayenne", "2025 and 2026"]);
    choice(doc, "Same race").click();
    expect(choice(doc, "Same race").classList.contains("on")).toBe(true);
    expect(choice(doc, "Don't know").classList.contains("on")).toBe(false);
  });
  it("Same race writes the alias line and joins the two", async () => {
    const { doc, texts, rows, button } = pageWith(MAYENNE);
    button("Find joins").click();
    choice(doc, "Same race").click();
    await save(button);
    expect(texts.get("racealiases")).toBe("Boucles de la Mayenne - Crédit Mutuel = Boucles de la Mayenne");
    expect(rows()).toHaveLength(1);
    expect(doc.getElementById("joinreview")!.textContent).toBe("");
    expect(doc.getElementById("mergednote")!.textContent).toContain("No more joins to review");
    expect(doc.getElementById("aliasmsg")!.textContent).toContain("1 pairs joined");
  });
  it("Not the same is struck through at once, remembered, and not suggested again", async () => {
    const { doc, texts, rows, button } = pageWith(MAYENNE);
    button("Find joins").click();
    choice(doc, "Not the same").click();
    expect(doc.querySelector("#joinreview tr.rejected")).not.toBeNull();
    await save(button);
    expect(texts.get("racenojoin")).toContain("Boucles de la Mayenne");
    expect(texts.get("racealiases")).toBe("");
    expect(rows()).toHaveLength(2);
    expect(doc.getElementById("mergednote")!.textContent).toContain("No more joins to review");
  });
  it("Don't know stores nothing, and the pair comes back next time", async () => {
    const { doc, texts, rows, button } = pageWith(MAYENNE);
    button("Find joins").click();
    await save(button); // saved without deciding
    expect(texts.get("racealiases")).toBe("");
    expect(texts.get("racenojoin")).toBe("");
    expect(rows()).toHaveLength(2);
    expect(doc.getElementById("aliasmsg")!.textContent).toContain("1 left undecided");
    expect(doc.getElementById("mergednote")!.textContent).toContain("1 possible join to review");
    button("Find joins").click();
    expect(choices(doc)).toHaveLength(3); // there it is again
  });
  it("Mark all as not the same rejects every pair at once", async () => {
    const { doc, texts, rows, button } = pageWith(MAYENNE);
    button("Find joins").click();
    button("Mark all as not the same").click();
    expect(doc.querySelectorAll("#joinreview tr.rejected")).toHaveLength(1);
    await save(button);
    expect(texts.get("racenojoin")).toContain("Boucles de la Mayenne");
    expect(rows()).toHaveLength(2);
    expect(doc.getElementById("aliasmsg")!.textContent).toContain("1 marked as not the same");
  });
  it("men's and women's pairs are never in the same table", () => {
    const names: [string, number, string?, ("ME" | "WE")?][] = [
      ["Alpha Grand Prix", 2026, "1.1", "ME"], ["Alpha Grand Prix Open", 2025, "1.1", "ME"],
      ["Beta Grand Prix", 2026, "1.WWT", "WE"], ["Beta Grand Prix Open", 2025, "1.WWT", "WE"],
    ];
    const headings = (doc: Document) => Array.from(doc.querySelectorAll("#joinreview h3")).map((h) => h.textContent);
    const pick = (doc: Document, value: string) => {
      const sel = doc.getElementById("queuecat") as HTMLSelectElement;
      for (const o of Array.from(sel.options)) o.toggleAttribute("selected", false);
      const target = Array.from(sel.options).find((o) => o.value === value)!;
      target.selected = true;
      target.toggleAttribute("selected", true);
    };
    const men = pageWith(names);
    men.button("Find joins").click();
    expect(headings(men.doc)).toEqual(["Men's elite races (1)"]);
    expect(men.doc.getElementById("joinreview")!.textContent).not.toContain("Beta");

    const women = pageWith(names);
    pick(women.doc, "WE");
    women.button("Find joins").click();
    expect(headings(women.doc)).toEqual(["Women's elite races (1)"]);
    expect(women.doc.getElementById("joinreview")!.textContent).not.toContain("Alpha");

    const both = pageWith(names);
    pick(both.doc, "all");
    both.button("Find joins").click();
    expect(headings(both.doc)).toEqual(["Men's elite races (1)", "Women's elite races (1)"]);
    expect(both.doc.querySelectorAll("#joinreview table")).toHaveLength(2);
  });
});

describe("the Category box in a real browser", () => {
  it("follows the browser's own selection, not the marker the page leaves on the first option", () => {
    const names: [string, number, string?, ("ME" | "WE")?][] = [["Alpha Grand Prix", 2026, "1.1", "ME"], ["Beta Grand Prix", 2026, "1.WWT", "WE"]];
    let shown = "WE"; // what the box shows: the user chose Women elite
    const { doc } = pageWith(names, (d) => {
      const select = d.getElementById("queuecat") as HTMLSelectElement;
      Object.defineProperty(select, "value", { get: () => shown, configurable: true }); // a browser's select knows its value
    });
    // the page's own start-up marks "Men elite" with a selected attribute; that must not win over the browser's answer
    const text = () => doc.getElementById("queueout")!.textContent ?? "";
    expect(text()).toContain("Beta Grand Prix");
    expect(text()).not.toContain("Alpha Grand Prix");
    expect(text()).toContain("1 men's race hidden");
    shown = "ME";
    (doc.getElementById("queuecat") as HTMLSelectElement).onchange!(new Event("change"));
    expect(text()).toContain("Alpha Grand Prix");
    expect(text()).not.toContain("Beta Grand Prix");
  });
});

describe("the Save and join button", () => {
  it("joins the two names you wrote, on the page, and remembers the line", async () => {
    const html = readFileSync(new URL("../src/site/races.html", import.meta.url), "utf8");
    const { document } = parseHTML(html);
    (globalThis as unknown as { document: Document }).document = document as unknown as Document;
    const doc = document as unknown as Document;
    for (const id of ["queuemissing", "queuetop"]) (doc.getElementById(id) as HTMLInputElement).checked = false;
    const cube = emptyCube();
    const comp = (id: number, name: string, year: number) => ({ id, name, start: year + "-06-01", end: year + "-06-08", year, country: "FRA", class: "2.UWT", inProgress: false, category: "ME" as const });
    addCapture(cube, { format: "racethreads-capture/1", competitions: [comp(1, "Critérium du Dauphiné", 2025), comp(2, "Critérium du Dauphiné", 2024), comp(3, "Tour Auvergne - Rhône-Alpes", 2026)] });
    const texts = new Map<string, string>();
    const store = { cube, onChange: () => undefined, saveCube: async () => undefined, getText: (k: string) => texts.get(k), setText: async (k: string, v: string) => void texts.set(k, v) } as unknown as Store;
    initRaces(store);
    const rows = () => Array.from(doc.querySelectorAll("#queueout table tr td:first-child")).map((c) => c.textContent);
    expect(rows().filter((r) => /Dauphin|Auvergne/.test(r ?? ""))).toHaveLength(2);

    (doc.getElementById("racealiases") as HTMLTextAreaElement).value = "Critérium du Dauphiné = Tour Auvergne - Rhône-Alpes";
    await (doc.getElementById("racealiasessave")!.onclick as () => Promise<void>)();
    expect(rows().filter((r) => /Dauphin|Auvergne/.test(r ?? ""))).toHaveLength(1);
    expect(texts.get("racealiases")).toContain("Dauphiné");
    expect(doc.getElementById("mergednote")!.textContent).toContain("1 joined");
    expect(doc.getElementById("aliasmsg")!.textContent).toContain("joined");
  });
  it("says why a line did nothing", async () => {
    const html = readFileSync(new URL("../src/site/races.html", import.meta.url), "utf8");
    const { document } = parseHTML(html);
    (globalThis as unknown as { document: Document }).document = document as unknown as Document;
    const doc = document as unknown as Document;
    for (const id of ["queuemissing", "queuetop"]) (doc.getElementById(id) as HTMLInputElement).checked = false;
    const cube = emptyCube();
    const comp = (id: number, name: string, year: number) => ({ id, name, start: year + "-06-01", end: year + "-06-08", year, country: "FRA", class: "2.UWT", inProgress: false, category: "ME" as const });
    addCapture(cube, { format: "racethreads-capture/1", competitions: [comp(1, "Race One", 2026), comp(2, "Race Two", 2026)] });
    const store = { cube, onChange: () => undefined, saveCube: async () => undefined, getText: () => undefined, setText: async () => undefined } as unknown as Store;
    initRaces(store);
    const NL = String.fromCharCode(10);
    (doc.getElementById("racealiases") as HTMLTextAreaElement).value = ["Race One = Race Two", "Race One = Nothing Like It"].join(NL);
    await (doc.getElementById("racealiasessave")!.onclick as () => Promise<void>)();
    const said = doc.getElementById("aliasmsg")!.textContent ?? "";
    expect(said).toContain("same year");
    expect(said).toContain('no race named "Nothing Like It"');
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
  it("puts the UCI class in front of the race name", () => {
    const { doc } = page();
    (doc.getElementById("queuemissing") as HTMLInputElement).checked = false;
    doc.getElementById("queuemissing")!.onchange!(new Event("change"));
    const cells = Array.from(doc.querySelectorAll("#queueout table tr td:first-child"));
    const finished = cells.find((c) => c.textContent?.includes("Finished Classic"))!;
    expect(finished.firstElementChild?.textContent).toBe("1.UWT");
    expect(finished.textContent).toBe("1.UWTFinished Classic");
    const waiting = cells.find((c) => c.textContent?.includes("Waiting Classic"))!;
    expect(waiting.firstElementChild?.textContent).toBe("1.Pro");
  });
  it("searches by name, ignoring case and accents", () => {
    const { doc, text } = page();
    (doc.getElementById("queuemissing") as HTMLInputElement).checked = false;
    const box = doc.getElementById("queuesearch") as HTMLInputElement;
    box.value = "FINISHED";
    box.oninput!(new Event("input") as unknown as InputEvent);
    expect(text()).toContain("Finished Classic");
    expect(text()).not.toContain("Waiting Classic");
  });
  it("sorts by class, WorldTour first, or by name", () => {
    const { doc } = pageWith([["Alpha Classic", 2026, "1.1"], ["Zeta Classic", 2026, "1.UWT"], ["Middle Classic", 2026, "1.Pro"]]);
    const order = () => Array.from(doc.querySelectorAll("#queueout table tr td:first-child")).map((c) => (c.textContent ?? "").replace(/^[0-9A-Za-z.]*(?=[A-Z][a-z]+ Classic)/, ""));
    const sort = doc.getElementById("queuesort") as HTMLSelectElement;
    const choose = (v: string) => {
      for (const o of Array.from(sort.options)) o.toggleAttribute("selected", false);
      const target = Array.from(sort.options).find((o) => o.value === v)!;
      target.selected = true;
      target.toggleAttribute("selected", true);
      sort.onchange!(new Event("change"));
    };
    choose("name");
    expect(order().filter((t) => /Classic/.test(t)).map((t) => t.slice(-14))).toHaveLength(3);
    const names = () => order().filter((t) => /Classic/.test(t)).map((t) => (/Alpha|Zeta|Middle/.exec(t) ?? [""])[0]);
    expect(names()).toEqual(["Alpha", "Middle", "Zeta"]);
    choose("class");
    expect(names()).toEqual(["Zeta", "Middle", "Alpha"]); // UWT, then Pro, then 1.1
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
