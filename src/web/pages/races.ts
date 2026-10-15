import { addQueue, parseUciHub, queueByRace } from "../../core";
import { importCaptureFiles } from "../capture-import";
import { $, el } from "../dom";
import type { Store } from "../store";

export function initRaces(store: Store): void {
  const cube = () => store.cube;

  function draw(): void {
    const { years, races } = queueByRace(cube());
    const out = $("queueout");
    out.replaceChildren();
    const editions = races.flatMap((r) => Object.values(r.editions));
    const done = editions.filter((e) => e.captured).length;
    const results = cube().raceResults?.length ?? 0;
    $("queuemsg").textContent = editions.length
      ? done + " of " + editions.length + " editions captured, " + races.length + " races, " + results + " race results in the database."
      : "No races in the queue yet: add a UCI hub page for each year (for example the 2025, 2026 and 2027 UCI WorldTour pages, saved from your browser).";
    const onlyMissing = $<HTMLInputElement>("queuemissing").checked;
    const rows = onlyMissing ? races.filter((r) => Object.values(r.editions).some((e) => !e.captured)) : races;
    if (!rows.length) return;

    const table = el("table", { class: "queue" });
    const head = el("tr", {}, el("th", { textContent: "Race" }), el("th", { textContent: "Done" }));
    for (const y of years) head.append(el("th", { textContent: String(y) }));
    table.append(head);
    for (const r of rows) {
      const eds = Object.values(r.editions);
      const tr = el("tr", {}, el("td", { textContent: r.name + (r.category === "WE" ? " (women)" : "") }), el("td", { textContent: eds.filter((e) => e.captured).length + "/" + eds.length }));
      for (const y of years) {
        const e = r.editions[y];
        const td = el("td");
        if (!e) {
          td.textContent = "-";
        } else {
          const a = el("a", {
            href: "https://www.uci.org/competition-details/" + e.year + "/ROA/" + e.uciId,
            target: "_blank",
            rel: "noopener",
            textContent: e.captured ? "done (" + e.rows + ")" : "open",
            title: e.name + ", " + e.start + (e.start === e.end ? "" : " to " + e.end),
          });
          if (e.captured) a.style.opacity = "0.6";
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
  $<HTMLInputElement>("hubfile").onchange = async (e) => {
    const lines: string[] = [];
    for (const f of [...((e.target as HTMLInputElement).files ?? [])]) {
      try {
        const hub = parseUciHub(await f.text());
        const n = addQueue(cube(), hub.title || f.name, hub.year, hub.races);
        lines.push(f.name + ": " + n + " new races of " + hub.races.length + " (" + hub.title + ")");
      } catch (err) {
        lines.push(f.name + ": " + (err instanceof Error ? err.message : "could not read this file"));
      }
    }
    await store.saveCube();
    draw();
    $("queuemsg").textContent = lines.join(" | ") + " | " + $("queuemsg").textContent;
  };
  $("queuemissing").onchange = draw;
  store.onChange(draw);
  draw();
}
