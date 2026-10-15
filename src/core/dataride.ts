import type { ResultRow } from "./cube";
import { parseUciDates } from "./uci-hub";

/**
 * Readers for the three kinds of DataRide road pages a moderator opens in their own browser:
 *  - the list of competitions (dataride.uci.ch/iframe/Results/10/): date, competition link, country, class
 *  - one competition (.../iframe/CompetitionResults/<id>): links to its events (General Classification, stages)
 *  - one event (.../iframe/EventResults/<eventId>?competitionId=<id>&disciplineId=10): the result table
 * They read what is already on screen. The competition id is DataRide's own number for a race edition.
 */

export type PageKind = "list" | "competition" | "event";

export interface DrCompetition {
  id: number;
  name: string;
  start: string; // ISO
  end: string;
  year: number;
  country: string;
  class: string; // "1.Pro", "2.UWT" ...
  inProgress: boolean;
  category?: "ME" | "WE";
}

export interface DrEvent {
  id: number;
  name: string;
}

export interface DrCompetitionEvents {
  competitionId: number;
  events: DrEvent[];
}

export interface DrEventResult {
  competitionId: number;
  eventId: number;
  heading: string; // "Giro del Veneto Individual Road Race"
  date?: string; // ISO start date of the event, when the page says
  totalRows: number; // how far the table reached: the highest rank on screen (one page of the table is 40 rows)
  rows: ResultRow[]; // only the rows that score points
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function pageKind(pathname: string): PageKind | undefined {
  if (/\/iframe\/Results\/\d*\/?$/i.test(pathname)) return "list";
  if (/\/iframe\/CompetitionResults\/\d+/i.test(pathname)) return "competition";
  if (/\/iframe\/EventResults\/\d+/i.test(pathname)) return "event";
  return undefined;
}

/** The women's races of the list are told from the men's by the page's Category filter, or by the name. */
export function categoryOf(name: string, filterText = ""): "ME" | "WE" {
  if (/women/i.test(filterText)) return "WE";
  if (/men/i.test(filterText)) return "ME";
  return /women|donne|dames|femmes|f[eé]minin|femenina|femminile|vrouwen|damen/i.test(name) ? "WE" : "ME";
}

/** Rows of the competition list. `filterText` is the text of the Category filter ("Men Elite"), if the page shows it. */
export function readCompetitionList(doc: Document, filterText = ""): DrCompetition[] {
  const out: DrCompetition[] = [];
  for (const tr of Array.from(doc.querySelectorAll("tr"))) {
    const a = tr.querySelector("a.uci-competition-link, a[href*='/CompetitionResults/']");
    const id = /CompetitionResults\/(\d+)/i.exec(a?.getAttribute("href") ?? "")?.[1];
    if (!a || !id) continue;
    const tds = Array.from(tr.querySelectorAll("td"));
    const dates = parseUciDates(clean(tds[0]?.textContent));
    if (!dates) continue;
    const name = clean(a.textContent);
    out.push({
      id: Number(id),
      name,
      start: dates.start,
      end: dates.end,
      year: Number(dates.end.slice(0, 4)),
      country: clean(tds[2]?.textContent),
      class: clean(tds[3]?.textContent),
      inProgress: clean(tr.querySelector(".uci-small-label")?.textContent) !== "",
      category: categoryOf(name, filterText),
    });
  }
  return out;
}

/** The events a competition page links to. */
export function readCompetitionEvents(doc: Document, pathname: string): DrCompetitionEvents | undefined {
  const competitionId = Number(/CompetitionResults\/(\d+)/i.exec(pathname)?.[1]);
  if (!competitionId) return undefined;
  const events: DrEvent[] = [];
  for (const a of Array.from(doc.querySelectorAll("a[href*='/EventResults/']"))) {
    const id = Number(/EventResults\/(\d+)/i.exec(a.getAttribute("href") ?? "")?.[1]);
    if (!id || events.some((e) => e.id === id)) continue;
    events.push({ id, name: clean(a.textContent) });
  }
  return { competitionId, events };
}

/** The result table of an event, restricted to the rows that score points. */
export function readEventResults(doc: Document, pathname: string, search: string): DrEventResult | undefined {
  const eventId = Number(/EventResults\/(\d+)/i.exec(pathname)?.[1]);
  const competitionId = Number(/competitionId=(\d+)/i.exec(search)?.[1]);
  if (!eventId || !competitionId) return undefined;

  const table = Array.from(doc.querySelectorAll("table")).find((t) => {
    const heads = Array.from(t.querySelectorAll("th")).map((h) => clean(h.textContent).toLowerCase());
    return heads.includes("rider") && heads.includes("points");
  });
  if (!table) return undefined;
  const heads = Array.from(table.querySelectorAll("th")).map((h) => clean(h.textContent).toLowerCase());
  const col = (name: string) => heads.indexOf(name);

  const rows: ResultRow[] = [];
  let totalRows = 0;
  let lastRank = 0;
  for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
    const tds = Array.from(tr.querySelectorAll("td"));
    if (tds.length < heads.length) continue;
    totalRows++;
    const cell = (name: string) => clean(tds[col(name)]?.textContent);
    const pointsCell = tds[col("points")];
    const points = parseFloat(clean(pointsCell?.querySelector(".uci-points-left")?.textContent ?? pointsCell?.textContent).replace(",", "."));
    const rank = parseInt(cell("rank"), 10);
    if (rank > lastRank) lastRank = rank;
    if (!(points > 0)) continue;
    rows.push({
      rank: rank > 0 ? rank : null,
      rider: cell("rider"),
      team: cell("team"),
      age: parseInt(cell("age"), 10) || null,
      nation: cell("nation"),
      result: cell("result"),
      points,
    });
  }

  // "Giro del Veneto Individual Road Race - 14 Oct 2026 Results": the page's heading (read without the page's scripts)
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
  for (const x of Array.from(body?.querySelectorAll("script, style") ?? [])) x.remove();
  const text = clean(body?.textContent);
  const m = /(?:IFrame\s+)?(.{3,160}?)\s+-\s+(\d{1,2}\s+[A-Za-z]{3}(?:\s*-\s*\d{1,2}\s+[A-Za-z]{3})?\s+\d{4})\s+Results/.exec(text);
  const out: DrEventResult = { competitionId, eventId, heading: m ? clean(m[1]!.replace(/^IFrame\s+/, "")) : "", totalRows: Math.max(totalRows, lastRank), rows };
  const when = m ? parseUciDates(m[2]!) : undefined;
  if (when) out.date = when.start;
  return out;
}

/** A heading with page script in front of it (an older capture): keep what comes after the script. */
export function cleanHeading(h: string): string {
  const i = h.lastIndexOf("});");
  return clean(i >= 0 ? h.slice(i + 3) : h);
}

/** Events that give UCI points: the general classification and the stages, not the jersey classifications. */
export function isScoringEvent(name: string): boolean {
  return !/points|youth|young|mountain|climber|sprint classif|combativ|teams? classif|best |kom/i.test(name);
}

/** A result list is complete when the table went on past the last scoring row; otherwise the next page may hold more points. */
export function isComplete(c: { rows: unknown[]; totalRows: number }): boolean {
  return c.rows.length < c.totalRows;
}
