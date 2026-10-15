import { queueByRace } from "../../core";
import { importCaptureFiles } from "../capture-import";
import { $, el } from "../dom";
import type { Store } from "../store";

export function initRaces(store: Store): void {
  const cube = () => store.cube;

  /** WorldTour, ProSeries and championships: the classes the main interest is in. */
  const isTop = (cls?: string) => /UWT|WWT|Pro|WC|CM/i.test(cls ?? "");
  /** An edition is finished when every event on its competition page has a result; without the event list, when anything is captured. */
  const finished = (e: { captured: boolean; eventsKnown: number; eventsCaptured: number }) => (e.eventsKnown ? e.eventsCaptured >= e.eventsKnown : e.captured);

  function draw(): void {
    const all = queueByRace(cube());
    const years = all.years.filter((y) => y > 0);
    const onlyTop = $<HTMLInputElement>("queuetop").checked;
    const races = onlyTop ? all.races.filter((r) => Object.values(r.editions).some((e) => isTop(e.class))) : all.races;
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
    if (!rows.length) return;

    const table = el("table", { class: "queue" });
    const head = el("tr", {}, el("th", { textContent: "Race" }), el("th", { textContent: "Done" }));
    for (const y of years) head.append(el("th", { textContent: String(y) }));
    table.append(head);
    for (const r of rows) {
      const eds = Object.values(r.editions);
      const tr = el("tr", {}, el("td", { textContent: r.name + (r.category === "WE" ? " (women)" : "") }), el("td", { textContent: eds.filter(finished).length + "/" + eds.length }));
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
            textContent: e.eventsKnown ? e.eventsCaptured + "/" + e.eventsKnown + " events" : e.captured ? "done (" + e.rows + ")" : "open",
            title: (e.class ? e.class + ", " : "") + e.name + ", " + e.start + (e.start === e.end ? "" : " to " + e.end),
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
  store.onChange(draw);
  draw();
}
