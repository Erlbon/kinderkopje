import { Assignment, CaptureFile, Cube, RaceResult, mergeRaceResult } from "../../core";
import { unpackAssignment } from "../assignment-link";
import { $, download, el, tick } from "../dom";
import { readUploaded } from "../saved-pages";

/**
 * The helper page: a moderator who helps collect opens a work package link, saves the listed race pages from
 * uci.org, drops the saved files here and downloads one small results file to send back.
 * No database: what has been read stays in this browser's storage until the helper clears it.
 */

const KEY = "pelotonic-helper-results";

function loadResults(): RaceResult[] {
  try {
    const v = JSON.parse(tick(KEY) ?? "[]") as RaceResult[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function initHelp(): Promise<void> {
  const cube: Cube = { teamSnapshots: [], raceResults: loadResults() };
  let assignment: Assignment | undefined;

  const nameBox = $<HTMLInputElement>("helpername");
  nameBox.value = tick("pelotonic-helper-name") ?? "";
  nameBox.onchange = () => tick("pelotonic-helper-name", nameBox.value.trim());

  // the work package is in the address: help.html#a=<package>
  const raw = new URLSearchParams(location.hash.replace(/^#/, "")).get("a");
  const intro = $("assignintro");
  if (raw) {
    try {
      assignment = await unpackAssignment(raw);
      intro.textContent = (assignment.title ?? "Work package") + ": " + assignment.races.length + " race pages to save.";
      if (assignment.note) $("assignnote").textContent = assignment.note;
    } catch (e) {
      intro.textContent = e instanceof Error ? e.message : String(e);
      intro.className = "err";
    }
  } else {
    intro.textContent = "No work package in this link. You can still drop any saved UCI race pages below; they are all accepted.";
  }

  function persist(): void {
    tick(KEY, JSON.stringify(cube.raceResults ?? []));
  }

  function rowsOf(r: RaceResult | undefined): number {
    return r ? r.classifications.reduce((n, c) => n + c.rows.length, 0) : 0;
  }

  function draw(): void {
    const results = new Map((cube.raceResults ?? []).map((r) => [r.uciId, r]));
    const out = $("helperlist");
    out.replaceChildren();
    const listed = assignment?.races ?? [];
    const done = listed.filter((r) => rowsOf(results.get(r.uciId)) > 0).length;
    const extra = (cube.raceResults ?? []).filter((r) => !listed.some((l) => l.uciId === r.uciId));
    $("helperprogress").textContent =
      (assignment ? done + " of " + listed.length + " races saved and read" : (cube.raceResults?.length ?? 0) + " races read") +
      (extra.length && assignment ? ", plus " + extra.length + " not on your list" : "") + ".";
    const table = el("table", { class: "queue" });
    table.append(el("tr", {}, el("th", { textContent: "Race" }), el("th", { textContent: "Year" }), el("th", { textContent: "UCI page" }), el("th", { textContent: "Read" })));
    const add = (name: string, year: number, id: number, r: RaceResult | undefined, off: boolean) => {
      const a = el("a", { href: "https://www.uci.org/competition-details/" + year + "/ROA/" + id, target: "_blank", rel: "noopener", textContent: "open on UCI" });
      const n = rowsOf(r);
      table.append(el("tr", {}, el("td", { textContent: name + (off ? " (not on your list)" : "") }), el("td", { textContent: String(year) }), el("td", {}, a), el("td", { textContent: n > 0 ? "yes, " + n + " rows" : "-" })));
    };
    for (const r of listed) add(r.name, r.year, r.uciId, results.get(r.uciId), false);
    for (const r of extra) add(r.name, r.year, r.uciId, r, true);
    if (listed.length || extra.length) out.append(table);
    ($<HTMLButtonElement>("helperdl")).disabled = !(cube.raceResults?.length);
  }

  async function take(files: File[]): Promise<void> {
    const who = nameBox.value.trim();
    const lines: string[] = [];
    for (const f of files) {
      try {
        const u = await readUploaded(f, who || undefined);
        if (u.kind === "race") {
          mergeRaceResult(cube, u.race);
          lines.push(f.name + ": " + u.race.name + " (" + u.race.year + "), " + rowsOf(u.race) + " point-scoring rows");
        } else {
          let n = 0;
          for (const r of u.file.raceResults ?? []) (mergeRaceResult(cube, r), n++);
          lines.push(f.name + ": " + n + " race results" + (u.file.snapshots?.length ? " (team rankings in this file are not used here)" : ""));
        }
      } catch (e) {
        lines.push(f.name + ": " + (e instanceof Error ? e.message : "could not read this file"));
      }
    }
    persist();
    draw();
    const msg = $("helpermsg");
    msg.textContent = lines.join(" | ");
    msg.className = "mut";
  }

  const input = $<HTMLInputElement>("helperfile");
  input.onchange = () => void take([...(input.files ?? [])]).then(() => (input.value = ""));
  const drop = $("drop");
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("over");
  };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    void take([...(e.dataTransfer?.files ?? [])]);
  };

  $("helperdl").onclick = () => {
    const who = nameBox.value.trim();
    const file: CaptureFile = { format: "racethreads-capture/1", raceResults: (cube.raceResults ?? []).map((r) => (who && !r.contributor ? { ...r, contributor: who } : r)) };
    const slug = (who || "helper").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "helper";
    download("pelotonic-results-" + slug + "-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(file), "application/json");
  };
  $("helperclear").onclick = () => {
    if (!confirm("Forget everything read so far? Download your results first if you have not sent them.")) return;
    cube.raceResults = [];
    persist();
    draw();
    $("helpermsg").textContent = "Cleared.";
  };
  draw();
}
