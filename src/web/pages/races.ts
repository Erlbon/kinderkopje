import { CATEGORY_NAMES, JoinSuggestion, chainLines, normRaceName, queueByRace, suggestJoins } from "../../core";
import { importCaptureFiles } from "../capture-import";
import { $, el, tick } from "../dom";
import type { Store } from "../store";

export function initRaces(store: Store): void {
  const cube = () => store.cube;

  /** Choose a category in the box (through its options, which every DOM allows). */
  const chooseCategory = (value: string) => {
    const options = Array.from($<HTMLSelectElement>("queuecat").options);
    for (const o of options) o.toggleAttribute("selected", false); // clear first: choosing one may clear the others
    const target = options.find((o) => o.value === value);
    if (target) {
      target.selected = true;
      target.toggleAttribute("selected", true);
    }
  };
  /** The chosen value of a select: the selected option, the first when none is marked. */
  const chosen = (id: string) => {
    const options = Array.from($<HTMLSelectElement>(id).options);
    return (options.find((o) => o.selected || o.hasAttribute("selected")) ?? options[0])?.value ?? "";
  };
  const chosenCategory = () => chosen("queuecat") || "ME";
  /** WorldTour, ProSeries and championships: the classes the main interest is in. */
  const isTop = (cls?: string) => /UWT|WWT|Pro|WC|CM/i.test(cls ?? "");
  /** How high a UCI class ranks: WorldTour first, then ProSeries, then the rest by level. */
  const tier = (cls?: string) => (/UWT|WWT/.test(cls ?? "") ? 0 : /Pro/.test(cls ?? "") ? 1 : /[12]\.1/.test(cls ?? "") ? 2 : /[12]\.2/.test(cls ?? "") ? 3 : 4);
  /** An edition is finished when every point-giving event on its competition page has a result read to the end. Without the event list nothing is known. */
  const finished = (e: { eventsKnown: number; eventsComplete: number }) => e.eventsKnown > 0 && e.eventsComplete >= e.eventsKnown;
  function status(e: { captured: boolean; rows: number; eventsKnown: number; eventsCaptured: number; eventsComplete: number }): [string, string] {
    if (!e.eventsKnown) return e.captured ? ["no event list (" + e.rows + ")", "Results are captured, but not the list of events: press the bookmark on the competition page"] : ["open", "Nothing captured yet"];
    const waiting = e.eventsCaptured - e.eventsComplete;
    return [e.eventsComplete + "/" + e.eventsKnown + " events", waiting ? waiting + " captured event(s) filled a whole page of the table: capture the next page" : e.eventsCaptured < e.eventsKnown ? "events still to capture" : "all events captured"];
  }

  function draw(): void {
    const all = queueByRace(cube(), store.getText("racealiases") ?? "");
    const pending = suggestJoins(cube(), store.getText("racealiases") ?? "", store.getText("racenojoin") ?? "").length;
    $("mergednote").textContent = (all.merged.length ? all.merged.length + " joined. " : "") + (pending ? pending + " possible join" + (pending === 1 ? "" : "s") + " to review." : "No more joins to review.");
    const years = all.years.filter((y) => y > 0);
    const onlyTop = $<HTMLInputElement>("queuetop").checked;
    // men's and women's races are kept apart: the page shows one category at a time
    const cat = chosenCategory();
    const inCategory = all.races.filter((r) => cat === "all" || r.category === cat);
    const races = onlyTop ? inCategory.filter((r) => Object.values(r.editions).some((e) => isTop(e.class))) : inCategory;
    const out = $("queueout");
    out.replaceChildren();
    const editions = races.flatMap((r) => Object.values(r.editions));
    const done = editions.filter(finished).length;
    const results = cube().raceResults?.length ?? 0;
    $("queuemsg").textContent = editions.length
      ? done + " of " + editions.length + " editions finished, " + races.length + " races, " + results + " races with results in the database."
      : "No races in the queue yet: capture the DataRide competition list (step 2 above), one page at a time, for each year.";
    const onlyMissing = $<HTMLInputElement>("queuemissing").checked;
    const unfinished = (r: (typeof races)[number]) => Object.values(r.editions).filter((e) => !finished(e)).length;
    let rows = onlyMissing ? races.filter((r) => unfinished(r) > 0) : races;
    // search by name (accents, case and punctuation do not matter), then sort
    const q = normRaceName($<HTMLInputElement>("queuesearch").value);
    if (q) rows = rows.filter((r) => normRaceName(r.name).includes(q) || normRaceName(r.keyName).includes(q));
    const newestClass = (r: (typeof races)[number]) => Object.values(r.editions).reduce((a, b) => (b.year > a.year ? b : a)).class;
    const sort = chosen("queuesort");
    rows = [...rows].sort((a, b) =>
      sort === "class" ? tier(newestClass(a)) - tier(newestClass(b)) || a.name.localeCompare(b.name) : sort === "todo" ? unfinished(b) - unfinished(a) || a.name.localeCompare(b.name) : 0,
    );
    // say what the two filters are hiding, with a way to show it
    const hiddenDone = races.length - rows.length;
    const hiddenClass = inCategory.length - races.length;
    const hiddenCategory = all.races.length - inCategory.length;
    if (hiddenDone > 0 || hiddenClass > 0 || hiddenCategory > 0) {
      const note = el("div", { class: "mut" });
      note.style.margin = "6px 0";
      if (hiddenDone > 0) {
        const show = el("button", { textContent: "Show them" });
        show.onclick = () => {
          $<HTMLInputElement>("queuemissing").checked = false;
          draw();
        };
        note.append(hiddenDone + " finished race" + (hiddenDone === 1 ? "" : "s") + " hidden. ", show, " ");
      }
      if (hiddenClass > 0) {
        const show = el("button", { textContent: "Show them" });
        show.onclick = () => {
          $<HTMLInputElement>("queuetop").checked = false;
          draw();
        };
        note.append(hiddenClass + " race" + (hiddenClass === 1 ? "" : "s") + " in other classes hidden. ", show);
      }
      if (hiddenCategory > 0) {
        const show = el("button", { textContent: "Show them" });
        show.onclick = () => {
          chooseCategory("all");
          draw();
        };
        note.append(" " + hiddenCategory + " " + (cat === "ME" ? "women's" : "men's") + " race" + (hiddenCategory === 1 ? "" : "s") + " hidden. ", show);
      }
      out.append(note);
    }
    if (!rows.length) return;

    const table = el("table", { class: "queue" });
    const head = el("tr", {}, el("th", { textContent: "Race" }), el("th", { textContent: "Done" }));
    for (const y of years) head.append(el("th", { textContent: String(y) }));
    table.append(head);
    for (const r of rows) {
      const eds = Object.values(r.editions);
      const nameCell = el("td");
      // the UCI class in front of the name: the newest edition's, with the history in the tooltip when it changed
      const newest = eds.reduce((a, b) => (b.year > a.year ? b : a));
      if (newest.class) {
        const changed = new Set(eds.map((e) => e.class).filter(Boolean)).size > 1;
        const tag = el("span", { class: "tag", textContent: newest.class });
        if (changed) tag.title = eds.sort((a, b) => b.year - a.year).map((e) => e.year + ": " + (e.class ?? "?")).join(", ");
        nameCell.append(tag);
      }
      nameCell.append(r.name + (r.category === "ME" ? "" : " (" + CATEGORY_NAMES[r.category].toLowerCase() + ")"));
      const tr = el("tr", {}, nameCell, el("td", { textContent: eds.filter(finished).length + "/" + eds.length }));
      for (const y of years) {
        const e = r.editions[y];
        const td = el("td");
        if (!e) {
          td.textContent = "-";
        } else {
          const a = el("a", {
            href: "https://dataride.uci.ch/iframe/CompetitionResults/" + e.uciId + "?disciplineId=10",
            target: "_blank",
            rel: "noopener",
            textContent: status(e)[0],
            title: (e.class ? e.class + ", " : "") + e.name + ", " + e.start + (e.start === e.end ? "" : " to " + e.end) + ". " + status(e)[1],
          });
          if (finished(e)) a.style.opacity = "0.6";
          td.append(a);
        }
        tr.append(td);
      }
      table.append(tr);
    }
    out.append(table);
  }

  $<HTMLInputElement>("capturefile").onchange = async (e) => {
    const lines = await importCaptureFiles(store, [...((e.target as HTMLInputElement).files ?? [])]);
    draw();
    $("queuemsg").textContent = lines.join(" | ") + " | " + $("queuemsg").textContent;
  };
  const NL = String.fromCharCode(10);
  const years = (ys: number[]) => (ys.length === 1 ? String(ys[0]) : ys[0] + "-" + ys[ys.length - 1]);

  /** The one-time review: every likely pair with a tick; ticked ones become alias lines, the rest are remembered as rejected. */
  function review(): void {
    const box = $("joinreview");
    box.replaceChildren();
    const isNational = (j: JoinSuggestion) => /national road/i.test(j.fromName);
    // national championships are many and alike: they go last, and can be unticked together
    const found = suggestJoins(cube(), store.getText("racealiases") ?? "", store.getText("racenojoin") ?? "").sort((a, b) => Number(isNational(a)) - Number(isNational(b)));
    if (!found.length) {
      box.append(el("p", { class: "mut", textContent: "No likely joins found." }));
      return;
    }
    const ticks: [JoinSuggestion, HTMLInputElement][] = [];
    const table = el("table", { class: "queue" });
    table.append(el("tr", {}, el("th", { textContent: "Join" }), el("th", { textContent: "Category" }), el("th", { textContent: "One name" }), el("th", { textContent: "The other name" }), el("th", { textContent: "Years of each" })));
    for (const j of found) {
      const box1 = el("input", { type: "checkbox", checked: true });
      ticks.push([j, box1]);
      table.append(
        el("tr", {}, el("td", {}, box1), el("td", { textContent: j.category === "WE" ? "Women" : "Men" }), el("td", { textContent: j.fromName }), el("td", { textContent: (j.class ? j.class + " " : "") + j.intoName }), el("td", { textContent: years(j.fromYears) + " and " + years(j.intoYears) })),
      );
    }
    const setAll = (on: boolean) => ticks.forEach(([, t]) => (t.checked = on));
    const all = el("button", { textContent: "Tick all" });
    all.onclick = () => setAll(true);
    const none = el("button", { textContent: "Untick all" });
    none.onclick = () => setAll(false);
    const nationals = ticks.filter(([j]) => isNational(j));
    const noNat = el("button", { textContent: "Untick national championships (" + nationals.length + ")" });
    noNat.onclick = () => nationals.forEach(([, t]) => (t.checked = false));
    const apply = el("button", { textContent: "Join the ticked ones" });
    apply.onclick = async () => {
      const yes = chainLines(ticks.filter(([, t]) => t.checked).map(([j]): [string, string] => [j.from, j.into]));
      const no = ticks.filter(([, t]) => !t.checked).map(([j]) => j.from + " = " + j.into);
      const keep = (key: string, add: string[]) => [store.getText(key) ?? "", ...add].filter((x) => x !== "").join(NL);
      await store.setText("racealiases", keep("racealiases", yes));
      await store.setText("racenojoin", keep("racenojoin", no));
      $<HTMLTextAreaElement>("racealiases").value = store.getText("racealiases") ?? "";
      box.replaceChildren();
      $("aliasmsg").textContent = yes.length + " joined, " + no.length + " rejected (they will not be suggested again).";
      draw();
    };
    const cancel = el("button", { textContent: "Cancel" });
    cancel.onclick = () => box.replaceChildren();
    box.append(el("p", { class: "mut", textContent: found.length + " likely joins. Untick any that are different races. A joined race is shown under its newest name." }), table, el("div", { class: "row" }, all, none, ...(nationals.length ? [noNat] : []), apply, cancel));
  }
  $("joinfind").onclick = review;

  $<HTMLTextAreaElement>("racealiases").value = store.getText("racealiases") ?? "";
  $("racealiasessave").onclick = async () => {
    const msg = $("aliasmsg");
    msg.textContent = "Saving ...";
    try {
      await store.setText("racealiases", $<HTMLTextAreaElement>("racealiases").value);
    } catch (e) {
      msg.textContent = "Could not save: " + (e instanceof Error ? e.message : String(e));
    }
    draw(); // joins what it can even when the save failed
    const report = queueByRace(cube(), $<HTMLTextAreaElement>("racealiases").value).aliasReport;
    if (msg.textContent === "Saving ...") msg.textContent = report.length ? "Saved. " + report.join(" | ") : "Saved. No alias lines to apply (write one as: old name = new name).";
  };
  $("queuemissing").onchange = draw;
  $("queuetop").onchange = draw;
  $("queuesearch").oninput = draw;
  $("queuesort").onchange = draw;
  const catBox = $<HTMLSelectElement>("queuecat");
  chooseCategory(tick("racecat") ?? "ME");
  catBox.onchange = () => {
    tick("racecat", chosenCategory());
    draw();
  };
  store.onChange(draw);
  draw();
}
