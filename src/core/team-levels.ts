import { Cube, TeamPoint } from "./cube";

/**
 * Team levels (WorldTeam = WT, ProTeam = PT; every other team is "other", mostly Continental).
 * The lists come from Wikipedia: the WorldTeams of each season in the "UCI WorldTeam" article, and
 * "List of <year> UCI ProTeams and Continental teams". Wikipedia is a secondary source: unmatched
 * teams are shown for a person to check, never guessed.
 */

export type Level = "WT" | "PT";

export interface ListedTeam {
  code: string;
  name?: string;
}

export interface LevelsOfSeason {
  WT: number[]; // UCI team ids
  PT: number[];
}

const NL = String.fromCharCode(10);

function cleanWiki(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read a Wikipedia team table: either "| CODE / ! scope=row | name" rows or "|| CODE || ... ||" rows. */
export function parseTeamList(wikitext: string): ListedTeam[] {
  const out: ListedTeam[] = [];
  for (const row of wikitext.split(NL + "|-")) {
    const lines = row.split(NL).map((l) => l.trim());
    const wide = lines.find((l) => l.startsWith("||"));
    if (wide) {
      const cells = wide.split("||").map((c) => c.trim()).filter(Boolean);
      if (cells[0] && /^[A-Z0-9]{2,4}$/.test(cells[0])) out.push({ code: cells[0] });
      continue;
    }
    const codeLine = lines.find((l) => /^\|\s*[A-Z0-9]{2,4}\s*$/.test(l));
    if (!codeLine) continue;
    const nameLine = lines.find((l) => l.startsWith("!") && l.includes('scope="row"'));
    const name = nameLine ? cleanWiki(nameLine.replace(/^!.*?scope="row"\s*\|/, "")) : undefined;
    out.push({ code: codeLine.replace(/^\|\s*/, "").trim(), name: name || undefined });
  }
  return out;
}

function norm(name: string): string {
  return name
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g"), "")
    .toLowerCase()
    .replace(/\b(team|cycling|pro|the|men's)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Find the captured teams that a Wikipedia list names. Code first (UCI codes), then the name.
 * Listed teams that are not found are returned for review: they may be outside the captured part of
 * the ranking, or spelled differently.
 */
export function matchListed(listed: ListedTeam[], teams: TeamPoint[]): { ids: number[]; unmatched: ListedTeam[] } {
  const ids: number[] = [];
  const unmatched: ListedTeam[] = [];
  for (const l of listed) {
    let hit = teams.find((t) => t.code.toLowerCase() === l.code.toLowerCase());
    if (!hit && l.name) {
      const n = norm(l.name);
      hit = teams.find((t) => {
        const m = norm(t.name);
        return m === n || (n.length >= 8 && m.length >= 8 && (m.includes(n) || n.includes(m)));
      });
    }
    if (hit) {
      if (!ids.includes(hit.teamId)) ids.push(hit.teamId);
    } else {
      unmatched.push(l);
    }
  }
  return { ids, unmatched };
}

export function setLevels(cube: Cube, season: number, levels: LevelsOfSeason): void {
  (cube.levels ??= {})[String(season)] = levels;
}

export function levelOf(cube: Cube, season: number, teamId: number): Level | undefined {
  const l = cube.levels?.[String(season)];
  if (!l) return undefined;
  return l.WT.includes(teamId) ? "WT" : l.PT.includes(teamId) ? "PT" : undefined;
}

export function hasLevels(cube: Cube, season: number): boolean {
  return !!cube.levels?.[String(season)];
}

/** A copy of the cube with only the WorldTeams and ProTeams of each season that has levels. */
export function onlyWorldAndPro(cube: Cube): Cube {
  return {
    levels: cube.levels,
    teamSnapshots: cube.teamSnapshots.map((s) =>
      hasLevels(cube, s.season) ? { ...s, teams: s.teams.filter((t) => levelOf(cube, s.season, t.teamId)) } : s,
    ),
  };
}

export interface BeatenLine {
  team: TeamPoint;
  level: Level;
  beatenBy: TeamPoint[]; // teams that are neither WorldTeam nor ProTeam but have more points
}

/** WorldTeams and ProTeams that teams of a lower level finished above (latest ranking of the season). */
export function beatenByLowerLevel(cube: Cube, season: number): { date?: string; lines: BeatenLine[]; missing: number } {
  const snap = cube.teamSnapshots.filter((s) => s.season === season).sort((a, b) => b.date.localeCompare(a.date))[0];
  const lv = cube.levels?.[String(season)];
  if (!snap || !lv) return { lines: [], missing: 0 };
  const others = snap.teams.filter((t) => !levelOf(cube, season, t.teamId));
  const lines: BeatenLine[] = [];
  for (const t of snap.teams) {
    const level = levelOf(cube, season, t.teamId);
    if (!level) continue;
    const beatenBy = others.filter((o) => o.points > t.points).sort((a, b) => b.points - a.points);
    if (beatenBy.length) lines.push({ team: t, level, beatenBy });
  }
  const present = new Set(snap.teams.map((t) => t.teamId));
  const missing = [...lv.WT, ...lv.PT].filter((id) => !present.has(id)).length;
  return { date: snap.date, lines: lines.sort((a, b) => b.team.points - a.team.points), missing };
}

function num(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function beatenMarkdown(seasonResults: { season: number; res: ReturnType<typeof beatenByLowerLevel> }[]): string {
  const rows: string[] = [];
  const notes: string[] = [];
  for (const { season, res } of seasonResults) {
    if (!res.date) continue;
    for (const l of res.lines) {
      rows.push(
        "|" + season + "|" + l.team.name + " (" + l.team.code + ")|" + l.level + "|" + num(l.team.points) + "|" +
          l.beatenBy.map((b) => b.name + " (" + num(b.points) + ")").join(", ") + "|",
      );
    }
    if (!res.lines.length) notes.push(season + ": no WorldTeam or ProTeam was beaten by a lower-level team.");
    if (res.missing) notes.push(season + ": " + res.missing + " WorldTeam/ProTeam(s) are outside the captured part of the ranking, so a lower-level team ahead of them may be missing here.");
  }
  const head = "|Season|WorldTeam / ProTeam|Level|Points|Finished behind (points)|";
  const sep = "|-:|:-|:-|-:|:-|";
  return [head, sep, ...rows].join(NL) + NL + NL + "WT = WorldTeam, PT = ProTeam. Teams listed as 'behind' are Continental or other lower-level teams with more UCI points in the season's latest captured ranking." + (notes.length ? NL + NL + notes.join(NL) : "");
}
