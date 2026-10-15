import { parse as parseYaml } from "yaml";

/**
 * Team points cube, slice 1: UCI World Ranking, team ranking snapshots by date.
 * Input: files made by tools/capture-dataride.js ("racethreads-capture/1").
 * Teams are keyed by UCI's own team id (objectId), which stays the same when a team is renamed
 * or changes its code (UAD in 2025, UEX in 2026 are the same team).
 */

export interface CaptureRow {
  rank: number;
  change?: string;
  name: string;
  code: string;
  nation: string;
  points: number;
  objectId: number | null;
  momentId: number | null;
}

export interface CaptureSnapshot {
  key: string;
  rankingTypeId: number | null;
  season: string;
  date: string; // ISO yyyy-mm-dd
  momentId: number | null;
  total: number | null;
  complete?: boolean;
  rows: CaptureRow[];
}

export interface CaptureFile {
  format: "racethreads-capture/1";
  snapshots: CaptureSnapshot[];
}

export interface TeamPoint {
  teamId: number;
  code: string;
  name: string;
  nation: string;
  rank: number;
  points: number;
}

export interface TeamSnapshot {
  date: string; // ISO
  season: number;
  momentId: number | null;
  complete: boolean; // every team of the ranking was captured
  teams: TeamPoint[];
}

export interface Cube {
  teamSnapshots: TeamSnapshot[];
}

export function emptyCube(): Cube {
  return { teamSnapshots: [] };
}

export interface ImportReport {
  added: number;
  replaced: number;
  skipped: string[];
}

const TEAM_RANKING = 2;

/** Merge a capture file into the cube. Same date again = replaced (newer capture wins). */
export function addCapture(cube: Cube, file: CaptureFile): ImportReport {
  const report: ImportReport = { added: 0, replaced: 0, skipped: [] };
  if (!file || file.format !== "racethreads-capture/1" || !Array.isArray(file.snapshots)) {
    report.skipped.push("not a racethreads capture file");
    return report;
  }
  for (const s of file.snapshots) {
    if (s.rankingTypeId !== TEAM_RANKING) {
      report.skipped.push((s.season || "?") + " " + (s.date || "?") + ": not a team ranking");
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
      report.skipped.push((s.season || "?") + ": no date (pick the date on the page and capture again)");
      continue;
    }
    const teams: TeamPoint[] = [];
    for (const r of s.rows) {
      if (r.objectId === null || Number.isNaN(r.points)) continue;
      teams.push({ teamId: r.objectId, code: r.code, name: r.name, nation: r.nation, rank: r.rank, points: r.points });
    }
    const snap: TeamSnapshot = {
      date: s.date,
      season: Number(s.season) || Number(s.date.slice(0, 4)),
      momentId: s.momentId,
      complete: !!s.complete,
      teams,
    };
    const i = cube.teamSnapshots.findIndex((x) => x.date === snap.date);
    if (i >= 0) {
      cube.teamSnapshots[i] = snap;
      report.replaced++;
    } else {
      cube.teamSnapshots.push(snap);
      report.added++;
    }
  }
  cube.teamSnapshots.sort((a, b) => a.date.localeCompare(b.date));
  return report;
}

export interface Merge {
  into: number; // UCI team id that continues
  from: number; // UCI team id that stops at `effective`
  effective: number; // first season of the merged team
  note?: string;
}

export interface Lineage {
  merges: Merge[];
}

export function parseLineage(text: string): Lineage {
  const v = parseYaml(text) as { merges?: unknown } | null;
  const merges = Array.isArray(v?.merges) ? (v!.merges as Merge[]) : [];
  for (const m of merges) {
    if (typeof m.into !== "number" || typeof m.from !== "number" || typeof m.effective !== "number") {
      throw new Error("team lineage: each merge needs numeric into, from and effective");
    }
  }
  return { merges };
}

/**
 * Seasons before a merge: add the stopping team's points to the continuing team, so the merged team's
 * history compares like with like (Lotto + Intermarché-Wanty before 2026). Returns a new cube.
 * Ranks are recomputed among the captured teams; they are left out (0) where the combined total
 * is lower than the lowest captured team, because then the true rank is unknown.
 */
export function combineMerged(cube: Cube, lineage: Lineage): Cube {
  const out: Cube = { teamSnapshots: [] };
  for (const s of cube.teamSnapshots) {
    let teams = s.teams.map((t) => ({ ...t }));
    let changed = false;
    for (const m of lineage.merges) {
      if (s.season >= m.effective) continue;
      const from = teams.find((t) => t.teamId === m.from);
      if (!from) continue;
      const into = teams.find((t) => t.teamId === m.into);
      if (into) {
        into.points = round(into.points + from.points);
      } else {
        teams.push({ ...from, teamId: m.into }); // the continuing team was outside the captured part
      }
      teams = teams.filter((t) => t !== from);
      changed = true;
    }
    if (changed) {
      const lowest = Math.min(...s.teams.map((t) => t.points));
      teams.sort((a, b) => b.points - a.points);
      teams = teams.map((t, i) => ({ ...t, rank: t.points >= lowest ? i + 1 : 0 }));
    }
    out.teamSnapshots.push({ ...s, teams });
  }
  return out;
}

/** The latest snapshot of `season` that is on or before `cutoff` (ISO date). */
export function snapshotAsOf(cube: Cube, season: number, cutoff: string): TeamSnapshot | undefined {
  let best: TeamSnapshot | undefined;
  for (const s of cube.teamSnapshots) {
    if (s.season === season && s.date <= cutoff && (!best || s.date > best.date)) best = s;
  }
  return best;
}

/** The same calendar day in another year (29 Feb falls back to 28 Feb). */
export function sameDayInYear(iso: string, year: number): string {
  const md = iso.slice(5);
  if (md === "02-29") return year + "-02-28";
  return year + "-" + md;
}

export interface TeamLine {
  teamId: number;
  name: string;
  code: string;
  nation: string;
  now?: number;
  before?: number;
  diff?: number;
  rankNow?: number;
  rankBefore?: number;
}

/**
 * Season to date against the same date last year (the fair comparison while the season is running).
 * Teams are matched by UCI team id, so renamed teams stay one line.
 */
export function compareToLastYear(
  cube: Cube,
  year: number,
  cutoff: string,
  options: { top?: number } = {},
): { now?: TeamSnapshot; before?: TeamSnapshot; lines: TeamLine[] } {
  const now = snapshotAsOf(cube, year, cutoff);
  const before = snapshotAsOf(cube, year - 1, sameDayInYear(cutoff, year - 1));
  const lines = new Map<number, TeamLine>();
  const get = (t: TeamPoint): TeamLine => {
    let l = lines.get(t.teamId);
    if (!l) {
      l = { teamId: t.teamId, name: t.name, code: t.code, nation: t.nation };
      lines.set(t.teamId, l);
    }
    return l;
  };
  for (const t of before?.teams ?? []) {
    const l = get(t);
    l.before = t.points;
    l.rankBefore = t.rank;
  }
  for (const t of now?.teams ?? []) {
    const l = get(t);
    l.name = t.name; // the current name wins
    l.code = t.code;
    l.now = t.points;
    l.rankNow = t.rank;
  }
  for (const l of lines.values()) {
    if (l.now !== undefined && l.before !== undefined) l.diff = round(l.now - l.before);
  }
  const sorted = [...lines.values()].sort((a, b) => (b.now ?? -1) - (a.now ?? -1) || (b.before ?? -1) - (a.before ?? -1));
  return { now, before, lines: options.top ? sorted.slice(0, options.top) : sorted };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface SeasonColumn {
  season: number;
  date: string; // the ranking used for this season (its latest one)
}

export interface SeasonLine {
  teamId: number;
  name: string;
  code: string;
  nation: string;
  points: (number | undefined)[]; // by column
  ranks: (number | undefined)[];
}

/**
 * Seasons side by side: for each season the latest ranking in the cube. Teams are matched by UCI team id,
 * so a team keeps its line through renames. A team missing from a captured ranking shows no number
 * (not zero): it was outside the captured part of that ranking, or it did not exist yet.
 */
export function seasonTable(
  cube: Cube,
  options: { seasons?: number[]; top?: number } = {},
): { columns: SeasonColumn[]; lines: SeasonLine[] } {
  const seasons = (options.seasons ?? [...new Set(cube.teamSnapshots.map((s) => s.season))]).sort((a, b) => a - b);
  const snaps = seasons
    .map((y) => cube.teamSnapshots.filter((s) => s.season === y).sort((a, b) => b.date.localeCompare(a.date))[0])
    .filter((s): s is TeamSnapshot => !!s);
  const columns = snaps.map((s) => ({ season: s.season, date: s.date }));
  const byId = new Map<number, SeasonLine>();
  snaps.forEach((s, i) => {
    for (const t of s.teams) {
      let l = byId.get(t.teamId);
      if (!l) {
        l = { teamId: t.teamId, name: t.name, code: t.code, nation: t.nation, points: snaps.map(() => undefined), ranks: snaps.map(() => undefined) };
        byId.set(t.teamId, l);
      }
      l.name = t.name; // later seasons come later in the loop: the newest name wins
      l.code = t.code;
      l.nation = t.nation;
      l.points[i] = t.points;
      l.ranks[i] = t.rank;
    }
  });
  const last = (l: SeasonLine) => {
    for (let i = l.points.length - 1; i >= 0; i--) if (l.points[i] !== undefined) return [i, l.points[i]!] as const;
    return [-1, -1] as const;
  };
  const lines = [...byId.values()].sort((a, b) => {
    const [ia, pa] = last(a);
    const [ib, pb] = last(b);
    return ib - ia || pb - pa; // teams in the newest season first, by points
  });
  return { columns, lines: options.top ? lines.slice(0, options.top) : lines };
}

export function seasonTableMarkdown(t: ReturnType<typeof seasonTable>): string {
  const nl = String.fromCharCode(10);
  const dm = (iso: string) => Number(iso.slice(8, 10)) + " " + MONTHS[Number(iso.slice(5, 7)) - 1];
  const head = "|Team|" + t.columns.map((c) => c.season + " (" + dm(c.date) + ")").join("|") + "|";
  const sep = "|:-|" + t.columns.map(() => "-:").join("|") + "|";
  const rows = t.lines.map(
    (l) =>
      "|" + l.name + " (" + l.code + ")|" +
      l.points.map((p, i) => (p === undefined ? "-" : num(p) + (l.ranks[i] ? " (#" + l.ranks[i] + ")" : ""))).join("|") + "|",
  );
  const note = "UCI World Ranking points of each season's latest ranking (date in brackets); rank in brackets after the points. A dash means the team is not in the captured part of that ranking.";
  return [head, sep, ...rows].join(nl) + nl + nl + note;
}

export interface MonthLine {
  teamId: number;
  name: string;
  code: string;
  /** points the team stood on at the end of each month of `year` (index 0 = January), undefined = no snapshot */
  total: (number | undefined)[];
  /** same for the year before */
  totalBefore: (number | undefined)[];
  /** points earned in each month (this month's total minus last month's); empty when last month's ranking is missing */
  gained: (number | undefined)[];
  gainedBefore: (number | undefined)[];
}

/** Month-end totals per team for two seasons, and what was gained during each month. */
export function monthlyOverview(cube: Cube, year: number, options: { top?: number } = {}): MonthLine[] {
  const monthEnd = (season: number): (TeamSnapshot | undefined)[] => {
    const out: (TeamSnapshot | undefined)[] = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      const last = new Date(Date.UTC(season, m, 0)).getUTCDate();
      out.push(snapshotAsOf(cube, season, season + "-" + mm + "-" + String(last).padStart(2, "0")));
    }
    // a month with no newer snapshot than the previous month's has no data of its own
    return out.map((s, i) => (s && i > 0 && out[i - 1] && s.date === out[i - 1]!.date ? undefined : s));
  };
  const cur = monthEnd(year);
  const prev = monthEnd(year - 1);
  const ids = new Map<number, { name: string; code: string }>();
  for (const s of [...prev, ...cur]) for (const t of s?.teams ?? []) ids.set(t.teamId, { name: t.name, code: t.code });
  const pointsOf = (s: TeamSnapshot | undefined, id: number): number | undefined =>
    s?.teams.find((t) => t.teamId === id)?.points;
  // Points earned in a month need the ranking at the end of the month before. If that one is
  // missing, the month stays empty rather than showing several months' points as one month.
  const gains = (totals: (number | undefined)[]): (number | undefined)[] =>
    totals.map((v, i) => {
      if (v === undefined) return undefined;
      if (i === 0) return v; // the season starts at zero
      const before = totals[i - 1];
      return before === undefined ? undefined : round(v - before);
    });
  const lines: MonthLine[] = [];
  for (const [id, info] of ids) {
    const total = cur.map((s) => pointsOf(s, id));
    const totalBefore = prev.map((s) => pointsOf(s, id));
    lines.push({ teamId: id, name: info.name, code: info.code, total, totalBefore, gained: gains(total), gainedBefore: gains(totalBefore) });
  }
  const latest = (l: MonthLine) => [...l.total].reverse().find((v) => v !== undefined) ?? -1;
  lines.sort((a, b) => latest(b) - latest(a));
  return options.top ? lines.slice(0, options.top) : lines;
}

// ---- markdown for the threads ----

function num(n: number | undefined): string {
  if (n === undefined) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function signed(n: number | undefined): string {
  if (n === undefined) return "-";
  return (n > 0 ? "+" : "") + num(n);
}

export function comparisonMarkdown(
  c: ReturnType<typeof compareToLastYear>,
  year: number,
  cutoff: string,
): string {
  const nl = String.fromCharCode(10);
  const head = "|Rank|Team|Nation|" + year + " (" + cutoff + ")|" + (year - 1) + " (same date)|Difference|";
  const sep = "|-:|:-|:-|-:|-:|-:|";
  const rows = c.lines.map(
    (l) => "|" + (l.rankNow ?? "-") + "|" + l.name + " (" + l.code + ")|" + l.nation + "|" + num(l.now) + "|" + num(l.before) + "|" + signed(l.diff) + "|",
  );
  const note =
    (c.now ? "Ranking of " + c.now.date : "No " + year + " ranking on or before " + cutoff) +
    ", compared with " + (c.before ? c.before.date : "no ranking") + ". UCI World Ranking points.";
  return [head, sep, ...rows].join(nl) + nl + nl + note;
}

export function monthlyMarkdown(lines: MonthLine[], year: number): string {
  const nl = String.fromCharCode(10);
  const monthsWithData = MONTHS.map((_, i) => lines.some((l) => l.total[i] !== undefined || l.totalBefore[i] !== undefined));
  const cols = MONTHS.map((m, i) => ({ m, i })).filter((c) => monthsWithData[c.i]);
  const head = "|Team|" + cols.map((c) => c.m).join("|") + "|";
  const sep = "|:-|" + cols.map(() => "-:").join("|") + "|";
  const rows: string[] = [];
  for (const l of lines) {
    const cell = (cur: number | undefined, prev: number | undefined) =>
      cur === undefined ? "-" : num(cur) + (prev === undefined ? "" : " (" + signed(round(cur - prev)) + ")");
    rows.push(
      "|" + l.name + " (" + l.code + ")|" +
        cols.map((c) => cell(l.gained[c.i], l.gainedBefore[c.i])).join("|") + "|",
    );
  }
  const note =
    "Points earned in each month of " + year + ", with the difference to the same month in " + (year - 1) +
    " in brackets. UCI World Ranking points, from the month-end rankings.";
  return [head, sep, ...rows].join(nl) + nl + nl + note;
}
