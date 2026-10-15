import { addQueue, assignByRace, parseUciHub, queueByRace } from "../../core";
import { packAssignment } from "../assignment-link";
import { importCaptureFiles } from "../capture-import";
import { $, NL, copy, el } from "../dom";
import type { Store } from "../store";

export function initRaces(store: Store): void {
  const cube = () => store.cube;

  /** The year boxes of the sharing panel follow the years in the queue; a box keeps its tick when the list is redrawn. */
  function drawShareYears(years: number[]): void {
    const box = $("shareyears");
    const ticked = new Map([...box.querySelectorAll<HTMLInputElement>("input")].map((i) => [i.value, i.checked]));
    box.replaceChildren();
    for (const y of years) {
      const cb = el("input", { type: "checkbox", value: String(y), checked: ticked.get(String(y)) ?? true });
      box.append(el("label", {}, cb, " " + y));
    }
  }

  async function makeLinks(): Promise<void> {
    const msg = $("sharemsg");
    const out = $("shareout");
    out.replaceChildren();
    const years = [...$("shareyears").querySelectorAll<HTMLInputElement>("input:checked")].map((i) => Number(i.value));
    const note = $<HTMLInputElement>("sharenote").value.trim();
    void store.setText("sharenote", note);
    const packages = assignByRace(cube(), { years, onlyMissing: $<HTMLInputElement>("sharemissing").checked, racesPerHelper: Number($<HTMLInputElement>("sharecount").value) || 10 });
    if (!packages.length) {
      msg.textContent = "Nothing to hand out: the queue is empty, everything is captured, or no year is ticked.";
      return;
    }
    msg.textContent = packages.length + " link" + (packages.length === 1 ? "" : "s") + ", " + packages.reduce((n, p) => n + p.races.length, 0) + " pages in all. Send each helper one link.";
    const base = new URL("help.html", location.href).href;
    for (let i = 0; i < packages.length; i++) {
      const pack = packages[i]!;
      const races = pack.races;
      const link = base + "#a=" + (await packAssignment({ v: 1, title: "Pelotonic: help collect UCI results (part " + (i + 1) + " of " + packages.length + ")", note: note || undefined, races }));
      const names = pack.raceNames;
      const b = el("button", { textContent: "Copy link" });
      b.onclick = () => copy(link, b);
      const message =
        "Hi! I am collecting UCI race results for the r/peloton tools (Pelotonic). Could you help with a few races? " +
        "Open this link: it lists " + races.length + " race pages to save and explains the steps (about two minutes per race, nothing to install)." +
        NL + NL + link + (note ? NL + NL + note : "");
      const bm = el("button", { textContent: "Copy message", title: "A ready-to-send note with the link in it" });
      bm.onclick = () => copy(message, bm);
      out.append(
        el("div", { class: "card" },
          el("div", { class: "row" }, el("strong", { textContent: "Helper " + (i + 1) }), el("span", { class: "mut", textContent: names.length + " races, " + races.length + " pages" }), b, bm),
          el("div", { class: "mut", textContent: names.slice(0, 8).join(", ") + (names.length > 8 ? ", ..." : "") }),
        ),
      );
    }
  }

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
    const who = new Map<string, number>();
    for (const r of cube().raceResults ?? []) if (r.contributor) who.set(r.contributor, (who.get(r.contributor) ?? 0) + 1);
    if (who.size) $("queuemsg").textContent += " Contributors: " + [...who].map(([n, c]) => n + " (" + c + ")").join(", ") + ".";
    drawShareYears(years);
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
  $<HTMLInputElement>("sharenote").value = store.getText("sharenote") ?? "";
  $("sharebuild").onclick = () => void makeLinks();
  store.onChange(draw);
  draw();
}
