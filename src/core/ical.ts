import { stringify } from "yaml";
import { addDays, eachDay } from "./dates";
import { RegistryRace, Season, SeasonRace } from "./types";

export interface IcsEvent {
  summary: string;
  location: string;
  start: string; // ISO, first day
  end: string; // ISO, last day (DTEND is exclusive in iCal; converted here)
}

const BACKSLASH = String.fromCharCode(92);

function unescapeIcs(s: string): string {
  return s
    .split(BACKSLASH + "n")
    .join(" ")
    .split(BACKSLASH + ",")
    .join(",")
    .split(BACKSLASH + ";")
    .join(";")
    .split(BACKSLASH + BACKSLASH)
    .join(BACKSLASH);
}

function isoFromIcs(v: string): string {
  const d = v.slice(0, 8);
  return d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
}

/** Minimal iCal reader: all-day VEVENTs with SUMMARY, LOCATION, DTSTART, DTEND. */
export function parseIcs(text: string): IcsEvent[] {
  // unfold continuation lines (a line starting with space or tab continues the previous one)
  const raw = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && lines.length) lines[lines.length - 1] += l.slice(1);
    else lines.push(l);
  }
  const events: IcsEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") cur = {};
    else if (l === "END:VEVENT") {
      if (cur && cur.SUMMARY && cur.DTSTART) {
        const start = isoFromIcs(cur.DTSTART);
        const end = cur.DTEND ? addDays(isoFromIcs(cur.DTEND), -1) : start;
        events.push({
          summary: unescapeIcs(cur.SUMMARY),
          location: unescapeIcs(cur.LOCATION ?? ""),
          start,
          end: end < start ? start : end,
        });
      }
      cur = null;
    } else if (cur) {
      const i = l.indexOf(":");
      if (i > 0) {
        const key = l.slice(0, i).split(";")[0]!;
        if (!(key in cur)) cur[key] = l.slice(i + 1);
      }
    }
  }
  return events;
}

const WOMEN = /women|donne|femmes|femenina|féminin|feminin|ladies|dames/i;

// Unicode combining marks U+0300..U+036F (built from char codes so no escape can be mangled by an editor).
const COMBINING_MARKS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface DraftOptions {
  /** Keep only these class prefixes, e.g. ["1.UWT","2.UWT","1.WWT","2.WWT"]. Empty/undefined = all. */
  classes?: string[];
  registry?: Record<string, RegistryRace>;
  year: number;
}

/**
 * Draft a season from a calendar feed (e.g. the inrng.com iCal).
 * Multi-day races become stage races with one empty stage per day; rest days
 * and route details have to be filled in afterwards.
 */
export function draftSeason(events: IcsEvent[], opts: DraftOptions): Season {
  const reg = opts.registry ?? {};
  const byKey = new Map<string, string>();
  for (const [id, r] of Object.entries(reg)) byKey.set(slugify(r.name) + "|" + r.category, id);

  const races: SeasonRace[] = [];
  const used = new Set<string>();
  for (const e of events) {
    const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(e.summary);
    const name = (m ? m[1]! : e.summary).trim();
    // The INRNG feed lists championships without a class code.
    const cls = m ? m[2]!.trim() : /^World Championships/i.test(e.summary) ? "WC" : "";
    if (opts.classes?.length && !opts.classes.some((c) => cls === c || cls.startsWith(c))) continue;
    const category = /mixed/i.test(name) ? "MX" : /WWT/.test(cls) || WOMEN.test(name) ? "WE" : "ME";
    const known = byKey.get(slugify(name) + "|" + category);
    let id = known ?? slugify(name) + "-" + category.toLowerCase();
    for (let n = 2; used.has(id); n++) id = (known ?? slugify(name) + "-" + category.toLowerCase()) + "-" + n;
    used.add(id);

    const base: SeasonRace = { race: id, class: cls };
    if (!known) {
      base.name = name;
      base.category = category;
    }
    const multi = e.end > e.start || cls.startsWith("2.");
    if (!multi) {
      races.push({ ...base, date: e.start });
    } else {
      races.push({
        ...base,
        stages: eachDay(e.start, e.end).map((date, i) => ({ n: i + 1, date })),
      });
    }
  }
  races.sort((a, b) => {
    const da = a.stages?.[0]?.date ?? a.date!;
    const db = b.stages?.[0]?.date ?? b.date!;
    return da.localeCompare(db);
  });
  return { season: opts.year, races };
}

export function seasonToYaml(season: Season): string {
  return stringify(season, { lineWidth: 0 });
}
