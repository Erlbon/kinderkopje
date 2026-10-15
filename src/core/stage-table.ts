import { addDays } from "./dates";
import { Stage } from "./types";

/**
 * Reads the stage table moderators already build by hand (markdown, like the internal work
 * thread for a Grand Tour) into stage data. Columns are found by their header names, so the
 * different orders and spellings used by different moderators all work.
 */

export interface StageTableResult {
  stages: Stage[];
  /** Days without a stage between two stages (the table skips them). */
  restDays: string[];
  tz?: string;
  notes: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

type Field = "date" | "stage" | "route" | "length" | "type" | "altitude" | "finish" | "time";

function fieldOf(header: string): Field | undefined {
  const h = header.toLowerCase().replace(/[^a-z>]/g, "");
  if (h === "date") return "date";
  if (h === "stage") return "stage";
  if (h === "route" || h === "from>to" || h === "fromto" || h === "course") return "route";
  if (h === "length" || h === "distance") return "length";
  if (h === "type" || h === "profile") return "type";
  if (h === "altitude" || h === "elevation" || h === "climbing") return "altitude";
  if (h === "finish" || h === "arrival") return "finish";
  if (h === "time" || h === "times") return "time";
  return undefined;
}

const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)$/;

/** "[text](url)" -> {text, url}; plain text -> {text}. */
function linkOf(cell: string): { text: string; url?: string } {
  const c = cell.trim();
  const m = LINK.exec(c);
  return m ? { text: m[1]!.trim(), url: m[2]! } : { text: c };
}

export function parseDateCell(cell: string, year: number): string | undefined {
  const pad = (n: number) => String(n).padStart(2, "0");
  const num = /(\d{1,2})\s*[./]\s*(\d{1,2})(?!\d)/.exec(cell);
  if (num) {
    const d = +num[1]!;
    const m = +num[2]!;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return year + "-" + pad(m) + "-" + pad(d);
  }
  const named = /(\d{1,2})\s*[. ]\s*([A-Za-z]{3})[A-Za-z]*/.exec(cell);
  if (named) {
    const m = MONTHS[named[2]!.toLowerCase()];
    if (m) return year + "-" + pad(m) + "-" + pad(+named[1]!);
  }
  return undefined;
}

function numberOf(cell: string): number | undefined {
  const m = /(\d+(?:[.,]\d+)?)/.exec(cell.replace(/\s/g, ""));
  return m ? Number(m[1]!.replace(",", ".")) : undefined;
}

/** Remove a trailing note marker like "^Tourview" (a superscript used to say what the link is). */
function cleanPlace(s: string): string {
  return s.replace(/\^.*$/, "").trim();
}

export function parseMarkdownStages(markdown: string, year: number): StageTableResult {
  const result: StageTableResult = { stages: [], restDays: [], notes: [] };
  const rows = markdown
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("|"));
  let map: (Field | undefined)[] | undefined;
  const tzs = new Set<string>();

  for (const row of rows) {
    const cells = row.replace(/^\|/, "").replace(/\|$/, "").split("|");
    if (cells.every((c) => /^[\s:\-_]*$/.test(c))) continue; // alignment row
    if (!map) {
      const m = cells.map((c) => fieldOf(c));
      if (m.includes("stage") && m.includes("date")) map = m;
      continue;
    }
    const get = (f: Field): string | undefined => {
      const i = map!.indexOf(f);
      return i >= 0 ? cells[i] : undefined;
    };
    const stageCell = get("stage");
    const dateCell = get("date");
    if (stageCell === undefined || dateCell === undefined) continue;
    const date = parseDateCell(dateCell, year);
    const sl = linkOf(stageCell);
    const n = parseInt(sl.text, 10);
    if (!date || Number.isNaN(n)) {
      result.notes.push("Skipped a row: " + row.slice(0, 60));
      continue;
    }
    const stage: Stage = { n, date };
    if (sl.url) stage.stageUrl = sl.url;

    const routeCell = get("route");
    if (routeCell) {
      const r = linkOf(routeCell);
      const [from, to] = r.text.split(/\s*>\s*/);
      if (from) stage.from = cleanPlace(from);
      stage.to = cleanPlace(to ?? from ?? "");
      if (r.url) stage.routeUrl = r.url;
    }
    const len = get("length");
    if (len && numberOf(len) !== undefined) stage.length = numberOf(len);
    const alt = get("altitude");
    if (alt && numberOf(alt) !== undefined) stage.altitude = numberOf(alt);
    const type = get("type");
    if (type) {
      const t = linkOf(type);
      if (t.text && t.text !== "-") stage.type = t.text;
      if (t.url) stage.typeUrl = t.url;
    }
    const fin = get("finish");
    if (fin) {
      const f = linkOf(fin);
      // "-" is kept: moderators write it on purpose where a stage has no finish type (team time trial).
      if (f.text) stage.finish = f.text;
      if (f.url) stage.finishUrl = f.url;
    }
    const time = get("time");
    if (time) {
      const range = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*([A-Z]{2,5})?/.exec(time);
      const single = /(\d{1,2}:\d{2})\s*([A-Z]{2,5})?/.exec(time);
      if (range) {
        stage.start = range[1];
        stage.end = range[2];
        if (range[3]) tzs.add(range[3]);
      } else if (single) {
        stage.start = single[1];
        if (single[2]) tzs.add(single[2]);
      }
    }
    result.stages.push(stage);
  }

  if (!map) result.notes.push("No table with Stage and Date columns found.");
  result.stages.sort((a, b) => a.date.localeCompare(b.date));
  // A day with no stage between two stages is a rest day.
  for (let i = 1; i < result.stages.length; i++) {
    for (let d = addDays(result.stages[i - 1]!.date, 1); d < result.stages[i]!.date; d = addDays(d, 1)) {
      result.restDays.push(d);
    }
  }
  if (tzs.size === 1) result.tz = [...tzs][0];
  else if (tzs.size > 1) result.notes.push("Several time zones in the table: " + [...tzs].join(", "));
  return result;
}
