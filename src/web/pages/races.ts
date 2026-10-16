import { CONTINENTS, RaceRecord, ageTableMarkdown, continentOf, countryOf, fiveByFiveMarkdown, fiveMatrix, linksMarkdown, normRaceName, raceAgeByYear, topRiders, yearsWithResults, LINK_LABELS } from "../../core";
import { $, copy, el, tick } from "../dom";
import type { Store } from "../store";
import { currentRaces } from "./race-links";

/**
 * The Races page: reads what has been collected. A list of races with filters (category, class, continent, name), and
 * one race opened at a time with its names, its links, the 5x5 and the age statistics, each ready to copy as Markdown.
 * Nothing is changed here; gathering and cleaning are on the Collect page.
 */

const WORLD_TOUR = /UWT|WWT/;
const WT_AND_PRO = /UWT|WWT|Pro/;
const LIST_LIMIT = 300;

export function initRaces(store: Store): void {
  let open: string | undefined; // the slug of the race that is open

  // the continents for the filter
  const cont = $<HTMLSelectElement>("rcont");
  for (const c of CONTINENTS) cont.append(el("option", { value: c, textContent: c }));

  /** The chosen value of a select; a test DOM without select values falls back to the options. */
  const chosen = (id: string) => {
    const select = $<HTMLSelectElement>(id);
    if (typeof select.value === "string" && select.value !== "") return select.value;
    const options = Array.from(select.options);
    return (options.find((o) => o.selected || o.hasAttribute("selected")) ?? options[0])?.value ?? "";
  };

  const hasResults = (r: RaceRecord) => yearsWithResults(store.cube, r).length > 0;

  function filtered(): RaceRecord[] {
    const cat = chosen("rcat");
    const cls = chosen("rclass");
    const continent = chosen("rcont");
    const q = normRaceName($<HTMLInputElement>("rsearch").value);
    const onlyResults = $<HTMLInputElement>("rresults").checked;
    return currentRaces(store)
      .filter((r) => (cat === "all" || r.category === cat) && (cls === "all" || (cls === "wt" ? WORLD_TOUR : WT_AND_PRO).test(r.class ?? "")) && (continent === "all" || continentOf(r.country) === continent))
      .filter((r) => !q || normRaceName(r.name).includes(q) || r.names.some((n) => normRaceName(n.name).includes(q)))
      .filter((r) => !onlyResults || hasResults(r))
      .sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
  }

  const years = (ys: number[]) => (ys.length > 1 ? ys[ys.length - 1] + "-" + ys[0] : String(ys[0] ?? ""));
  const sortedDesc = (ys: number[]) => [...ys].sort((a, b) => b - a);

  function link(l: { url: string; kind: keyof typeof LINK_LABELS; label?: string; source: string }): HTMLElement {
    return el("a", { href: l.url, target: "_blank", rel: "noopener", textContent: l.label ?? LINK_LABELS[l.kind], title: l.url });
  }

  function drawList(): void {
    const list = $("rlist");
    list.replaceChildren();
    const races = filtered();
    $("rcount").textContent = races.length + " race" + (races.length === 1 ? "" : "s") + (races.length > LIST_LIMIT ? " (the first " + LIST_LIMIT + " are shown: narrow it down with the filters)" : "") + ".";
    if (!races.length) return;
    const table = el("table", { class: "queue" });
    table.append(el("tr", {}, el("th", { textContent: "Race" }), el("th", { textContent: "Country" }), el("th", { textContent: "Results" }), el("th", { textContent: "Links" })));
    for (const r of races.slice(0, LIST_LIMIT)) {
      const open1 = el("button", { class: "twist", textContent: r.name + (r.category === "WE" ? " (women)" : ""), title: "Open this race", type: "button" });
      open1.style.fontSize = "15px";
      open1.onclick = () => select(r.slug);
      const nameCell = el("td");
      if (r.class) nameCell.append(el("span", { class: "tag", textContent: r.class }));
      nameCell.append(open1);
      const country = countryOf(r.country);
      const linkCell = el("td");
      r.links.forEach((l, i) => {
        if (i) linkCell.append(", ");
        linkCell.append(link(l));
      });
      const done = yearsWithResults(store.cube, r);
      table.append(el("tr", {}, nameCell, el("td", { textContent: country ? country.name + " (" + country.continent + ")" : (r.country ?? "") }), el("td", { textContent: done.length ? years(done) + " (" + done.length + ")" : "-" }), linkCell));
    }
    list.append(table);
  }

  function select(slug: string | undefined): void {
    open = slug;
    try {
      location.hash = slug ? "race=" + slug : "";
    } catch {
      /* no address bar to update */
    }
    drawDetail();
  }

  /** A box with a title, its content and a button that copies it as Markdown. */
  function box(title: string, content: HTMLElement | string, markdown?: string): HTMLElement {
    const b = el("div", { class: "card" });
    const head = el("div", { class: "row" }, el("strong", { textContent: title }));
    if (markdown) {
      const button = el("button", { textContent: "Copy as Markdown", type: "button" });
      button.onclick = () => copy(markdown, button);
      head.append(button);
    }
    b.append(head, typeof content === "string" ? el("div", { class: "mut", textContent: content }) : content);
    return b;
  }

  function drawDetail(): void {
    const out = $("rdetail");
    out.replaceChildren();
    const race = open ? currentRaces(store).find((r) => r.slug === open) : undefined;
    $("rfilters").style.display = race ? "none" : ""; // the list is out of the way while a race is open
    if (!race) return;
    const cube = store.cube;
    const done = yearsWithResults(cube, race);
    const back = el("button", { textContent: "Back to the list", type: "button" });
    back.onclick = () => select(undefined);
    const country = countryOf(race.country);
    out.append(
      el("h2", { textContent: race.name }),
      el(
        "div",
        { class: "mut" },
        (race.class ? race.class + ", " : "") + (race.category === "WE" ? "women's elite" : "men's elite") + (country ? ", " + country.name + " (" + country.continent + ")" : "") + ". Results for " + (done.length ? done.length + " edition" + (done.length === 1 ? "" : "s") + " (" + years(done) + ")" : "no edition yet") + " of " + race.years.length + ".",
      ),
      el("div", { class: "row" }, back),
    );

    // names
    out.append(box("Names", "Internal name: " + race.name + ". External names (how UCI wrote it): " + race.names.map((n) => n.name + " (" + years(sortedDesc(n.years)) + ")").join("; ") + "."));

    // links
    const linkBox = el("div");
    if (race.links.length) {
      race.links.forEach((l, i) => {
        if (i) linkBox.append(" / ");
        linkBox.append(link(l));
      });
    } else {
      linkBox.append(el("span", { class: "mut", textContent: "No links yet. They are added on the Collect page." }));
    }
    out.append(box("Links", linkBox, race.links.length ? linksMarkdown(race.links) : undefined));

    // the 5x5: the places as rows and the years as columns, as the threads write their tables; the other way round on request
    const five = topRiders(cube, race);
    if (five.length) {
      const opts = { yearsAsRows: tick("fivelayout") === "rows", fullNames: tick("fivenames") === "full" };
      const matrix = fiveMatrix(five, 5, opts);
      const table = el("table", { class: "queue" });
      table.append(el("tr", {}, ...matrix[0]!.map((h) => el("th", { textContent: h }))));
      for (const r of matrix.slice(1)) table.append(el("tr", {}, ...r.map((c) => el("td", { textContent: c }))));
      const picker = (key: string, options: [string, string][], current: string) => {
        const select = el("select");
        for (const [value, label] of options) {
          const o = el("option", { value, textContent: label });
          if (value === current) {
            o.selected = true;
            o.setAttribute("selected", "");
          }
          select.append(o);
        }
        select.onchange = () => {
          const options2 = Array.from(select.options);
          const value = (typeof select.value === "string" && select.value) || (options2.find((o) => o.selected) ?? options2[0])?.value || "";
          tick(key, value);
          drawDetail();
        };
        return select;
      };
      const controls = el(
        "div",
        { class: "row" },
        el("span", { class: "mut", textContent: "Layout" }),
        picker("fivelayout", [["cols", "Places as rows, years as columns"], ["rows", "Years as rows"]], opts.yearsAsRows ? "rows" : "cols"),
        el("span", { class: "mut", textContent: "Names" }),
        picker("fivenames", [["surname", "Surnames"], ["full", "Full names"]], opts.fullNames ? "full" : "surname"),
      );
      const holder = el("div", {}, controls, table);
      const missing = five.filter((r) => r.missing.length).length;
      out.append(box("5x5: the top five of the last " + five.length + " edition" + (five.length === 1 ? "" : "s"), holder, fiveByFiveMarkdown(five, 5, opts)));
      if (missing) out.append(el("div", { class: "mut", textContent: missing + " edition" + (missing === 1 ? " lacks" : "s lack") + " some of the first five places in the data (shown as -)." }));
    } else {
      out.append(box("5x5", "No results collected for this race yet."));
    }

    // age
    const ages = raceAgeByYear(cube, race);
    if (ages.length) {
      const table = el("table", { class: "queue" });
      table.append(el("tr", {}, el("th", { textContent: "Year" }), el("th", { textContent: "Average age" }), el("th", { textContent: "Riders" })));
      for (const a of ages) table.append(el("tr", {}, el("td", { textContent: a.label }), el("td", { textContent: a.average.toFixed(1) }), el("td", { textContent: String(a.riders) })));
      out.append(box("Average age of the point-scoring riders", table, ageTableMarkdown(ages)));
      out.append(el("div", { class: "mut", textContent: "Only the riders who scored points are in the data, so this is the age at the front of the race, not of the whole field." }));
    }
    out.scrollIntoView?.();
  }

  for (const id of ["rcat", "rclass", "rcont"]) $(id).onchange = drawList;
  $("rsearch").oninput = drawList;
  $("rresults").onchange = drawList;
  store.onChange(() => {
    drawList();
    drawDetail();
  });

  // a race can be opened from an address: races.html#race=<slug>
  try {
    const m = /race=([^&]+)/.exec(location.hash);
    if (m) open = decodeURIComponent(m[1]!);
  } catch {
    /* no address in a test DOM */
  }
  drawList();
  drawDetail();
}
