import type { Cube, RaceRecord, ResultClassification, ResultRow } from "./cube";
import type { Category } from "./dataride";

/**
 * Race statistics from the captured results. First: the 5x5, the top five of each of the last five editions of a race.
 * It reads the race's final result: the single result of a one-day race, or the final general classification of a
 * stage race (not a stage, not a jersey classification).
 */

export interface FiveRow {
  year: number;
  riders: ResultRow[]; // the places 1..n that were captured, in order
  missing: number[]; // places that are not in the data (the table was not read that far)
}

/** The classification that names the winner of an edition: the final general classification, or the only one. */
export function finalClassification(classifications: ResultClassification[]): ResultClassification | undefined {
  if (classifications.length === 1) return classifications[0];
  const finals = classifications.filter((c) => /general classification$/i.test(c.label) && !/stage|overall/i.test(c.label));
  return finals.sort((a, b) => b.rows.length - a.rows.length)[0];
}

/** The top `places` of each of the last `editions` editions that have results, newest first. */
export function topRiders(cube: Cube, race: RaceRecord, editions = 5, places = 5): FiveRow[] {
  const out: FiveRow[] = [];
  for (const r of (cube.raceResults ?? []).filter((x) => race.uciIds.includes(x.uciId)).sort((a, b) => b.year - a.year)) {
    const final = finalClassification(r.classifications);
    if (!final) continue;
    const riders = final.rows.filter((w) => w.rank !== null && w.rank >= 1 && w.rank <= places).sort((a, b) => a.rank! - b.rank!);
    const have = new Set(riders.map((w) => w.rank));
    out.push({ year: r.year, riders, missing: Array.from({ length: places }, (_, i) => i + 1).filter((p) => !have.has(p)) });
    if (out.length >= editions) break;
  }
  return out;
}

const PARTICLES = new Set(["van", "der", "den", "de", "di", "da", "del", "della", "dos", "das", "du", "von", "le", "la", "el", "al", "ten", "ter"]);

function capitalise(word: string): string {
  const lower = word.toLowerCase();
  if (PARTICLES.has(lower)) return lower;
  if (lower.startsWith("mc") && lower.length > 2) return "Mc" + lower[2]!.toUpperCase() + lower.slice(3);
  return lower
    .split("-")
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join("-");
}

/** UCI writes "VAN DER POEL Mathieu" (SURNAME Given names); on r/peloton it reads "Mathieu van der Poel". */
export function displayName(uciName: string): string {
  const words = uciName.trim().split(" ").filter((w) => w !== "");
  const isSurname = (w: string) => w === w.toUpperCase() && w !== w.toLowerCase();
  let i = 0;
  while (i < words.length && isSurname(words[i]!)) i++;
  if (i === 0 || i === words.length) return words.map(capitalise).join(" "); // no clear split: leave it readable
  const surname = words.slice(0, i).map(capitalise); // particles (van, der, de ...) in lower case, as in Mathieu van der Poel; a few Belgian riders use capitals (Van Avermaet), which the data cannot tell
  return [...words.slice(i), ...surname].join(" ");
}

export interface FiveOptions {
  yearsAsRows?: boolean; // default: the places 1 to 5 are the rows and the years the columns, newest on the left
  fullNames?: boolean; // default: the surname only ("van der Poel"); true: "Mathieu van der Poel"
}

/** The surname of a UCI name ("VAN DER POEL Mathieu" -> "van der Poel"); the whole name when there is no clear split. */
export function surnameOf(uciName: string): string {
  const words = uciName.trim().split(" ").filter((w) => w !== "");
  const isSurname = (w: string) => w === w.toUpperCase() && w !== w.toLowerCase();
  let i = 0;
  while (i < words.length && isSurname(words[i]!)) i++;
  if (i === 0 || i === words.length) return displayName(uciName);
  return displayName(words.slice(0, i).join(" ") + " X").slice(0, -2); // the surname words, written as names are
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

/** The 5x5 as a table of text: the header row first. A place missing from the data is a dash. */
export function fiveMatrix(rows: FiveRow[], places = 5, o: FiveOptions = {}): string[][] {
  const name = (w: ResultRow | undefined) => (w ? (o.fullNames ? displayName(w.rider) : surnameOf(w.rider)) : "-");
  const at = (r: FiveRow, place: number) => name(r.riders.find((x) => x.rank === place));
  const placesList = Array.from({ length: places }, (_, i) => i + 1);
  if (o.yearsAsRows) return [["Year", ...ORDINALS.slice(0, places)], ...rows.map((r) => [String(r.year), ...placesList.map((p) => at(r, p))])];
  return [["Rank", ...rows.map((r) => String(r.year))], ...placesList.map((p) => [String(p), ...rows.map((r) => at(r, p))])];
}

/** The 5x5 as a Markdown table, newest edition first, written the way the threads write their tables. */
export function fiveByFiveMarkdown(rows: FiveRow[], places = 5, o: FiveOptions = {}): string {
  const NL = String.fromCharCode(10);
  const m = fiveMatrix(rows, places, o);
  const line = (cells: string[]) => "|" + cells.join("|") + "|";
  return [line(m[0]!), line(m[0]!.map(() => ":-")), ...m.slice(1).map(line)].join(NL);
}

/** The average of the ages that are known, or nothing when none is. */
export function averageAge(rows: { age: number | null }[]): number | undefined {
  const ages = rows.map((r) => r.age).filter((a): a is number => typeof a === "number" && a > 0);
  return ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : undefined;
}

export interface AgeLine {
  label: string; // the year, or the team
  riders: number; // results counted (one per rider per race)
  races: number;
  average: number;
}

/**
 * The results the age statistics count: for each race edition its final result (the single result of a one-day race,
 * the final general classification of a stage race), so that a rider is counted once per race and not once per stage.
 * Only the riders who scored points are in the data, so these are the ages at the front of the race, not of the whole field.
 */
function finalRows(cube: Cube, category: Category): { year: number; uciId: number; rows: ResultRow[] }[] {
  const cat = new Map((cube.queue ?? []).map((q) => [q.uciId, q.category ?? "ME"]));
  const out: { year: number; uciId: number; rows: ResultRow[] }[] = [];
  for (const r of cube.raceResults ?? []) {
    if ((cat.get(r.uciId) ?? "ME") !== category) continue;
    const final = finalClassification(r.classifications);
    if (final) out.push({ year: r.year, uciId: r.uciId, rows: final.rows });
  }
  return out;
}

/** The average age of the point-scoring riders per year, oldest year last. */
export function ageByYear(cube: Cube, category: Category = "ME"): AgeLine[] {
  const years = new Map<number, { rows: ResultRow[]; races: number }>();
  for (const r of finalRows(cube, category)) {
    const y = years.get(r.year) ?? { rows: [], races: 0 };
    y.rows.push(...r.rows);
    y.races++;
    years.set(r.year, y);
  }
  return [...years]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([year, y]) => {
      const average = averageAge(y.rows);
      return average === undefined ? [] : [{ label: String(year), riders: y.rows.filter((r) => r.age).length, races: y.races, average }];
    });
}

/** The average age of each team's point-scoring riders in a year; teams with fewer than `minResults` results are left out. Youngest first. */
export function ageByTeam(cube: Cube, year: number, category: Category = "ME", minResults = 20): AgeLine[] {
  const teams = new Map<string, { rows: ResultRow[]; races: Set<number> }>();
  for (const r of finalRows(cube, category).filter((x) => x.year === year)) {
    for (const row of r.rows) {
      const t = teams.get(row.team) ?? { rows: [], races: new Set<number>() };
      t.rows.push(row);
      t.races.add(r.uciId);
      teams.set(row.team, t);
    }
  }
  return [...teams]
    .flatMap(([team, t]) => {
      const average = averageAge(t.rows);
      const riders = t.rows.filter((r) => r.age).length;
      return average === undefined || riders < minResults ? [] : [{ label: team, riders, races: t.races.size, average }];
    })
    .sort((a, b) => a.average - b.average);
}

/** The average age of the point-scoring riders of one race, edition by edition, oldest first. */
export function raceAgeByYear(cube: Cube, race: RaceRecord): AgeLine[] {
  const years = new Map<number, ResultRow[]>();
  for (const r of cube.raceResults ?? []) {
    if (!race.uciIds.includes(r.uciId)) continue;
    const final = finalClassification(r.classifications);
    if (final) years.set(r.year, [...(years.get(r.year) ?? []), ...final.rows]);
  }
  return [...years]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([year, rows]) => {
      const average = averageAge(rows);
      return average === undefined ? [] : [{ label: String(year), riders: rows.filter((r) => r.age).length, races: 1, average }];
    });
}

/** The editions of a race that have a final result in the data, newest first. */
export function yearsWithResults(cube: Cube, race: RaceRecord): number[] {
  const out = new Set<number>();
  for (const r of cube.raceResults ?? []) if (race.uciIds.includes(r.uciId) && finalClassification(r.classifications)) out.add(r.year);
  return [...out].sort((a, b) => b - a);
}

/** The ages as a Markdown table. */
export function ageTableMarkdown(lines: AgeLine[]): string {
  const NL = String.fromCharCode(10);
  return ["| Year | Average age | Riders |", "|---|--:|--:|", ...lines.map((l) => "| " + l.label + " | " + l.average.toFixed(1) + " | " + l.riders + " |")].join(NL);
}
