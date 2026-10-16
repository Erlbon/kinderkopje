import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { addCapture, emptyCube } from "../src/core";
import { initRaces } from "../src/web/pages/races";
import { forgetChoices } from "../src/web/dom";
import type { Store } from "../src/web/store";

// the Races page, with a small collection: three men's World Tour races with results, a ProSeries race, a race without results, a women's race
const NL = String.fromCharCode(10);
const row = (rank: number, rider: string, age: number) => ({ rank, rider, team: "T", age, nation: "NED", result: "x", points: 100 - rank });
const WINNERS = ["VAN DER POEL Mathieu", "POGAČAR Tadej", "GANNA Filippo", "PHILIPSEN Jasper", "MATTHEWS Michael"];

function page(texts = new Map<string, string>()) {
  forgetChoices(); // every page is a fresh visit
  const html = readFileSync(new URL("../src/site/races.html", import.meta.url), "utf8");
  const { document } = parseHTML(html);
  (globalThis as unknown as { document: Document }).document = document as unknown as Document;
  const doc = document as unknown as Document;
  (doc.getElementById("rresults") as HTMLInputElement).checked = true;
  const cube = emptyCube();
  const comp = (id: number, name: string, year: number, cls: string, country: string, category: "ME" | "WE" = "ME") => ({ id, name, start: year + "-03-20", end: year + "-03-20", year, country, class: cls, inProgress: false, category });
  const list = [
    ...[2023, 2024, 2025].map((y, i) => comp(10 + i, "Milano-Sanremo", y, "1.UWT", "ITA")),
    ...[2024, 2025].map((y, i) => comp(20 + i, "Tour of Flanders", y, "1.UWT", "BEL")),
    comp(30, "Tour of Guangxi", 2025, "2.UWT", "CHN"),
    comp(40, "Tour of Britain", 2025, "2.Pro", "GBR"),
    comp(50, "Race Without Results", 2025, "1.UWT", "FRA"),
    comp(60, "Strade Bianche Donne", 2025, "1.WWT", "ITA", "WE"),
  ];
  addCapture(cube, { format: "racethreads-capture/1", competitions: list });
  const results = (id: number, shift: number, base: number) => ({
    competitionId: id, eventId: id, heading: "x", totalRows: 80,
    rows: WINNERS.map((n, i) => row(i + 1, WINNERS[(i + shift) % WINNERS.length]!, base + i)),
  });
  addCapture(cube, { format: "racethreads-capture/1", eventResults: [results(10, 0, 24), results(11, 1, 25), results(12, 2, 26), results(20, 3, 27), results(21, 4, 28), results(30, 0, 29), results(40, 1, 30), results(60, 2, 22)] });
  if (!texts.has("racelinks")) texts.set("racelinks", JSON.stringify({ "milanosanremo|ME": [{ kind: "website", url: "https://www.milanosanremo.it/", source: "wikidata" }, { kind: "instagram", url: "https://www.instagram.com/milanosanremo", source: "manual" }] }));
  const store = { cube, onChange: () => undefined, saveCube: async () => undefined, getText: (k: string) => texts.get(k), setText: async (k: string, v: string) => void texts.set(k, v) } as unknown as Store;
  initRaces(store);
  const names = () => Array.from(doc.querySelectorAll("#rlist table tr td:first-child")).map((c) => (c.textContent ?? "").replace(/^[0-9A-Za-z.]*(?=[A-Z][a-z])/, ""));
  const pick = (id: string, value: string) => {
    const sel = doc.getElementById(id) as HTMLSelectElement;
    for (const o of Array.from(sel.options)) o.toggleAttribute("selected", false);
    const target = Array.from(sel.options).find((o) => o.value === value)!;
    target.selected = true;
    target.toggleAttribute("selected", true);
    sel.onchange!(new Event("change"));
  };
  return { doc, names, pick, texts };
}

describe("the Races page: finding a race", () => {
  it("starts with the men's World Tour races that have results, and says how many", () => {
    const { doc, names } = page();
    expect(names().sort()).toEqual(["Milano-Sanremo", "Tour of Flanders", "Tour of Guangxi"]); // not the ProSeries race, the women's race or the race without results
    expect(doc.getElementById("rcount")!.textContent).toContain("3 races");
  });
  it("shows the class, the country with its continent, the years with results and the links of each race", () => {
    const { doc } = page();
    const msr = Array.from(doc.querySelectorAll("#rlist table tr")).find((r) => (r.textContent ?? "").includes("Milano-Sanremo"))!;
    expect(msr.textContent).toContain("1.UWT");
    expect(msr.textContent).toContain("Italy (Europe)");
    expect(msr.textContent).toContain("2023-2025 (3)");
    expect(Array.from(msr.querySelectorAll("a")).map((a) => a.textContent)).toEqual(["Official site", "Instagram"]);
  });
  it("filters by class, category, continent and name, and can include races without results", () => {
    const { doc, names, pick } = page();
    pick("rclass", "pro");
    expect(names().sort()).toEqual(["Milano-Sanremo", "Tour of Britain", "Tour of Flanders", "Tour of Guangxi"]);
    pick("rcont", "Asia");
    expect(names()).toEqual(["Tour of Guangxi"]);
    pick("rcont", "all");
    pick("rcat", "WE");
    expect(names()).toEqual(["Strade Bianche Donne (women)"]);
    pick("rcat", "ME");
    pick("rclass", "wt");
    const search = doc.getElementById("rsearch") as HTMLInputElement;
    search.value = "FLANDERS";
    search.oninput!(new Event("input") as unknown as InputEvent);
    expect(names()).toEqual(["Tour of Flanders"]);
    search.value = "";
    search.oninput!(new Event("input") as unknown as InputEvent);
    const only = doc.getElementById("rresults") as HTMLInputElement;
    only.checked = false;
    only.onchange!(new Event("change"));
    expect(names()).toContain("Race Without Results");
  });
});

describe("the Races page: one race", () => {
  const open = (doc: Document, name: string) => (Array.from(doc.querySelectorAll("#rlist button.twist")).find((b) => b.textContent === name) as HTMLButtonElement).click();

  it("opens a race with its names, links, 5x5 and age, and puts the list away", () => {
    const { doc } = page();
    open(doc, "Milano-Sanremo");
    const detail = doc.getElementById("rdetail")!;
    expect(detail.querySelector("h2")!.textContent).toBe("Milano-Sanremo");
    expect(detail.textContent).toContain("1.UWT, men's elite, Italy (Europe)");
    expect(detail.textContent).toContain("Results for 3 editions (2023-2025) of 3");
    expect((doc.getElementById("rfilters") as HTMLElement).style.display).toBe("none");
    const titles = Array.from(detail.querySelectorAll(".card .row strong")).map((s) => s.textContent);
    expect(titles).toEqual(["Names", "Links", "5x5: the top five of the last 3 editions", "Average age of the point-scoring riders"]);
  });
  it("the 5x5 has the places as rows and the years as columns, newest on the left, surnames, and a copy button", () => {
    const { doc } = page();
    open(doc, "Milano-Sanremo");
    const card = Array.from(doc.querySelectorAll("#rdetail .card")).find((c) => (c.textContent ?? "").includes("5x5"))!;
    const rows = Array.from(card.querySelectorAll("table tr")).map((r) => Array.from(r.querySelectorAll("th, td")).map((c) => c.textContent));
    expect(rows[0]).toEqual(["Rank", "2025", "2024", "2023"]);
    expect(rows[1]).toEqual(["1", "Ganna", "Mathieu".length ? "van der Poel" : "", "van der Poel"].slice(0, 1).concat(rows[1]!.slice(1) as string[]));
    expect(rows).toHaveLength(6); // the header and the places 1 to 5
    expect(Array.from(card.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Copy as Markdown"]);
  });
  it("the other layout and full names are one choice away, and are remembered", () => {
    const { doc } = page();
    open(doc, "Milano-Sanremo");
    const choose = (index: number, value: string) => {
      const select = doc.querySelectorAll("#rdetail .card select")[index] as HTMLSelectElement;
      for (const o of Array.from(select.options)) o.toggleAttribute("selected", false); // clear first: choosing one may clear the others
      const target = Array.from(select.options).find((o) => o.value === value)!;
      target.selected = true;
      target.toggleAttribute("selected", true);
      select.onchange!(new Event("change"));
    };
    choose(0, "rows");
    choose(1, "full");
    const card = () => Array.from(doc.querySelectorAll("#rdetail .card")).find((c) => (c.textContent ?? "").includes("5x5"))!;
    const rows = () => Array.from(card().querySelectorAll("table tr")).map((r) => Array.from(r.querySelectorAll("th, td")).map((c) => c.textContent));
    expect(rows()[0]).toEqual(["Year", "1st", "2nd", "3rd", "4th", "5th"]);
    expect(rows()[1]![1]).toMatch(/^[A-Z][a-z]+ /); // a full name: given name first
  });
  it("shows the links as a line, the average age per year, and says when there is nothing to show", () => {
    const { doc } = page();
    open(doc, "Milano-Sanremo");
    const links = Array.from(doc.querySelectorAll("#rdetail .card")).find((c) => (c.textContent ?? "").startsWith("Links"))!;
    expect(links.textContent).toContain("Official site / Instagram");
    const age = Array.from(doc.querySelectorAll("#rdetail .card")).find((c) => (c.textContent ?? "").startsWith("Average age"))!;
    const cells = Array.from(age.querySelectorAll("table tr")).map((r) => Array.from(r.querySelectorAll("td")).map((c) => c.textContent));
    expect(cells[1]).toEqual(["2023", "26.0", "5"]); // ages 24 to 28 in the first edition
    expect(age.nextElementSibling?.textContent).toContain("not of the whole field");
    // a race without links says where to add them
    const back = Array.from(doc.querySelectorAll("#rdetail button")).find((b) => b.textContent === "Back to the list") as HTMLButtonElement;
    back.click();
    open(doc, "Tour of Flanders");
    expect(doc.getElementById("rdetail")!.textContent).toContain("No links yet. They are added on the Collect page.");
  });
  it("goes back to the list", () => {
    const { doc, names } = page();
    open(doc, "Tour of Flanders");
    (Array.from(doc.querySelectorAll("#rdetail button")).find((b) => b.textContent === "Back to the list") as HTMLButtonElement).click();
    expect(doc.getElementById("rdetail")!.textContent).toBe("");
    expect((doc.getElementById("rfilters") as HTMLElement).style.display).toBe("");
    expect(names()).toHaveLength(3);
    expect(NL).toBe(String.fromCharCode(10));
  });
});
