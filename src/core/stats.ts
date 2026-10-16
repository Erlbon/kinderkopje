import type { Cube, RaceRecord, ResultClassification, ResultRow } from "./cube";

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

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

/** The 5x5 as a Markdown table, newest edition first. A place missing from the data is shown as a dash. */
export function fiveByFiveMarkdown(rows: FiveRow[], places = 5): string {
  const NL = String.fromCharCode(10);
  const head = "| Year | " + ORDINALS.slice(0, places).join(" | ") + " |";
  const rule = "|---|" + ":--|".repeat(places);
  const body = rows.map((r) => {
    const cells = Array.from({ length: places }, (_, i) => {
      const w = r.riders.find((x) => x.rank === i + 1);
      return w ? displayName(w.rider) : "-";
    });
    return "| " + r.year + " | " + cells.join(" | ") + " |";
  });
  return [head, rule, ...body].join(NL);
}
