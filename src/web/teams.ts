import lineageYaml from "../../data/cube/team-lineage.yaml";
import seasonsYaml from "../../data/cube/seasons.yaml";
import {
  CaptureFile,
  Cube,
  addCapture,
  beatenByLowerLevel,
  beatenMarkdown,
  combineMerged,
  compareToLastYear,
  comparisonMarkdown,
  emptyCube,
  fetchSection,
  fetchSectionList,
  hasLevels,
  matchListed,
  monthlyMarkdown,
  monthlyOverview,
  onlyWorldAndPro,
  parseLineage,
  parseOpenSeasons,
  parseTeamList,
  seasonTable,
  seasonTableMarkdown,
  setLevels,
  withoutSeasons,
} from "../core";

const KEY = "rt-cube";
const lineage = parseLineage(lineageYaml);
const openSeasons = parseOpenSeasons(seasonsYaml);

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function load(): Cube {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Cube | null;
    if (v && Array.isArray(v.teamSnapshots)) return v;
  } catch {
    /* storage can be blocked or hold something else */
  }
  return emptyCube();
}

function store(c: Cube): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    $("cubemsg").textContent += " (too big to keep in the browser: use Save cube to keep it)";
  }
}

function download(name: string, text: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

function copy(text: string, btn: HTMLButtonElement): void {
  const done = () => {
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 1200);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => undefined);
}

export function initTeams(): void {
  let cube = load();

  function seasons(): number[] {
    return [...new Set(cube.teamSnapshots.map((s) => s.season))].sort((a, b) => b - a);
  }

  function summary(): string {
    const n = cube.teamSnapshots.length;
    if (!n) return "No rankings yet. Capture them on UCI DataRide and open the file here.";
    const bySeason = seasons().map((y) => y + ": " + cube.teamSnapshots.filter((s) => s.season === y).length);
    const partial = cube.teamSnapshots.filter((s) => !s.complete).length;
    return n + " team rankings (" + bySeason.join(", ") + ")" + (partial ? "; " + partial + " not complete (not every page was captured)" : "");
  }

  function refresh(): void {
    $("cubemsg").textContent = summary();
    const showOpen = $<HTMLInputElement>("cubeopen").checked;
    const ys = seasons().filter((y) => showOpen || !openSeasons.includes(y));
    if (!ys.length) {
      $("cubeout").replaceChildren();
      return;
    }
    const yearInput = $<HTMLInputElement>("cubeyear");
    if (!yearInput.value || !ys.includes(Number(yearInput.value))) yearInput.value = String(ys[0]);
    const year = Number(yearInput.value);
    const dates = cube.teamSnapshots.filter((s) => s.season === year).map((s) => s.date);
    const cutoffInput = $<HTMLInputElement>("cubecutoff");
    if (!cutoffInput.value || cutoffInput.value.slice(0, 4) !== String(year)) cutoffInput.value = dates[dates.length - 1] ?? year + "-12-31";
    const top = Number($<HTMLInputElement>("cubetop").value) || 20;

    // Merged teams (Lotto + Intermarché-Wanty before 2026) are added together when the box is ticked.
    const base = showOpen ? cube : withoutSeasons(cube, openSeasons);
    const merged = $<HTMLInputElement>("cubecombine").checked ? combineMerged(base, lineage) : base;
    const anyLevels = ys.some((y) => hasLevels(cube, y));
    const view = anyLevels && $<HTMLInputElement>("cubelevelonly").checked ? onlyWorldAndPro(merged) : merged;
    const cmp = compareToLastYear(view, year, cutoffInput.value, { top });
    const monthly = monthlyOverview(view, year, { top });
    const nl = String.fromCharCode(10);
    const mergeNote = $<HTMLInputElement>("cubecombine").checked && lineage.merges.length
      ? nl + nl + "Merged teams: " + lineage.merges.map((m) => (m.note ?? "team " + m.from + " merged into team " + m.into) + " (" + m.effective + ")").join("; ") +
        ". Earlier seasons add the two teams' points together; a rank in those seasons is where the combined total would stand among the captured teams."
      : "";
    const blocks: [string, string][] = [
      ["Seasons side by side (latest ranking of each season)", seasonTableMarkdown(seasonTable(view, { top })) + mergeNote],
      ["Season to date against the same date last year", comparisonMarkdown(cmp, year, cutoffInput.value)],
      ["Points earned per month against last year", monthlyMarkdown(monthly, year)],
    ];
    if (anyLevels) {
      const results = ys.slice().sort((a, b) => a - b).filter((y) => hasLevels(cube, y)).map((y) => ({ season: y, res: beatenByLowerLevel(base, y) }));
      blocks.unshift(["WorldTeams and ProTeams beaten by lower-level teams", beatenMarkdown(results)]);
    }
    const out = $("cubeout");
    out.replaceChildren();
    for (const [title, md] of blocks) {
      const b = document.createElement("button");
      b.textContent = "Copy markdown";
      b.onclick = () => copy(md, b);
      const h = document.createElement("div");
      h.className = "row";
      const t = document.createElement("strong");
      t.textContent = title;
      h.append(t, b);
      const pre = document.createElement("pre");
      pre.textContent = md;
      const card = document.createElement("div");
      card.className = "card";
      card.append(h, pre);
      out.append(card);
    }
  }

  $<HTMLInputElement>("capturefile").onchange = async (e) => {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    const lines: string[] = [];
    for (const f of files) {
      try {
        const r = addCapture(cube, JSON.parse(await f.text()) as CaptureFile);
        lines.push(f.name + ": " + r.added + " added, " + r.replaced + " replaced" + (r.skipped.length ? ", skipped: " + r.skipped.join("; ") : ""));
      } catch {
        lines.push(f.name + ": could not read this file");
      }
    }
    store(cube);
    refresh();
    $("cubemsg").textContent = lines.join(" | ") + " | " + summary();
  };
  $<HTMLInputElement>("cubefile").onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const v = JSON.parse(await f.text()) as Cube;
      if (!Array.isArray(v.teamSnapshots)) throw new Error("not a cube file");
      cube = v;
      store(cube);
      refresh();
    } catch {
      $("cubemsg").textContent = "That is not a cube file.";
    }
  };
  $("cubesave").onclick = () => download("racethreads-cube.json", JSON.stringify(cube));
  $("cubeclear").onclick = () => {
    if (!confirm("Delete all captured rankings from this browser?")) return;
    cube = emptyCube();
    store(cube);
    refresh();
  };
  for (const id of ["cubeyear", "cubecutoff", "cubetop", "cubecombine", "cubeopen", "cubelevelonly"]) $(id).onchange = refresh;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  $("cubelevels").onclick = async () => {
    const msg = $("cubemsg");
    const years = seasons().filter((y) => !hasLevels(cube, y));
    if (!years.length) {
      msg.textContent = "Team levels are already loaded for every season in the cube.";
      return;
    }
    const lines: string[] = [];
    try {
      msg.textContent = "Fetching the WorldTeam list structure from Wikipedia ...";
      const wtSections = await fetchSectionList("UCI WorldTeam");
      for (const y of years) {
        await sleep(1200); // one request at a time, with a pause: Wikipedia limits bursts
        const snap = cube.teamSnapshots.filter((s) => s.season === y).sort((a, b) => b.date.localeCompare(a.date))[0]!;
        const wtIdx = wtSections.find((s) => s.line === String(y))?.index;
        msg.textContent = "Fetching " + y + " ...";
        const wtList = wtIdx ? parseTeamList(await fetchSection("UCI WorldTeam", wtIdx)) : [];
        await sleep(1200);
        const ptList = parseTeamList(await fetchSection("List of " + y + " UCI ProTeams and Continental teams", "1"));
        const wt = matchListed(wtList, snap.teams);
        const pt = matchListed(ptList, snap.teams);
        setLevels(cube, y, { WT: wt.ids, PT: pt.ids });
        const lost = [...wt.unmatched, ...pt.unmatched].map((t) => t.name ?? t.code);
        lines.push(y + ": " + wt.ids.length + " of " + wtList.length + " WorldTeams, " + pt.ids.length + " of " + ptList.length + " ProTeams found in the captured ranking" + (lost.length ? " (not found: " + lost.join(", ") + ")" : ""));
      }
    } catch (e) {
      lines.push("Stopped: " + (e instanceof Error ? e.message : String(e)) + ". What was fetched so far is kept; try again later for the rest.");
    }
    store(cube);
    refresh();
    $("cubemsg").textContent = lines.join(" | ");
  };

  // the install link for the capture bookmark is filled in by the build
  refresh();
}
