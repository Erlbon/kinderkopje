import { CATEGORY_NAMES, queueByRace } from "../../core";
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
  /** The chosen category: the selected option, men's elite when none is marked. */
  const chosenCategory = () => {
    const options = Array.from($<HTMLSelectElement>("queuecat").options);
    return (options.find((o) => o.selected || o.hasAttribute("selected")) ?? options[0])?.value ?? "ME";
  };
  /** WorldTour, ProSeries and championships: the classes the main interest is in. */
  const isTop = (cls?: string) => /UWT|WWT|Pro|WC|CM/i.test(cls ?? "");
  /** An edition is finished when every point-giving event on its competition page has a result read to the end. Without the event list nothing is known. */
  const finished = (e: { eventsKnown: number; eventsComplete: number }) => e.eventsKnown > 0 && e.eventsComplete >= e.eventsKnown;
  function status(e: { captured: boolean; rows: number; eventsKnown: number; eventsCaptured: number; eventsComplete: number }): [string, string] {
    if (!e.eventsKnown) return e.captured ? ["no event list (" + e.rows + ")", "Results are captured, but not the list of events: press the bookmark on the competition page"] : ["open", "Nothing captured yet"];
    const waiting = e.eventsCaptured - e.eventsComplete;
    return [e.eventsComplete + "/" + e.eventsKnown + " events", waiting ? waiting + " captured event(s) filled a whole page of the table: capture the next page" : e.eventsCaptured < e.eventsKnown ? "events still to capture" : "all events captured"];
  }

  function draw(): void {
    const all = queueByRace(cube());
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
    const rows = onlyMissing ? races.filter((r) => Object.values(r.editions).some((e) => !finished(e))) : races;
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
      const tr = el("tr", {}, el("td", { textContent: r.name + (r.category === "ME" ? "" : " (" + CATEGORY_NAMES[r.category].toLowerCase() + ")") }), el("td", { textContent: eds.filter(finished).length + "/" + eds.length }));
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
  $("queuemissing").onchange = draw;
  $("queuetop").onchange = draw;
  const catBox = $<HTMLSelectElement>("queuecat");
  chooseCategory(tick("racecat") ?? "ME");
  catBox.onchange = () => {
    tick("racecat", chosenCategory());
    draw();
  };
  store.onChange(draw);
  draw();
}
