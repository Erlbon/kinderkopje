import type { ResultClassification, ResultRow } from "./cube";

/**
 * Reading a UCI race page (uci.org/competition-details/<year>/ROA/<id>) once its results are open.
 * Used by the capture bookmark, which reads the live page. A page saved with "Save as" does not work: UCI loads the
 * results when the accordion opens and they never reach the saved file.
 */

export interface RaceFacts {
  name: string;
  dates?: string;
  classText?: string;
  class?: string;
}

const ID_URL = /\/competition-details\/(\d{4})\/ROA\/(\d+)/;

export function raceIdFromUrl(url: string | null | undefined): { year: number; uciId: number } | undefined {
  const m = ID_URL.exec(url ?? "");
  return m ? { year: Number(m[1]), uciId: Number(m[2]) } : undefined;
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** All the text below a node with a space between separate elements (textContent would glue them together). */
export function spacedText(root: Node): string {
  const parts: string[] = [];
  const walk = (n: Node): void => {
    if (n.nodeType === 3) {
      parts.push(n.nodeValue ?? "");
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = (n as Element).tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") return;
    for (const c of Array.from(n.childNodes)) walk(c);
    parts.push(" ");
  };
  walk(root);
  return clean(parts.join(" "));
}

/** Name, class and dates of the race, read from the visible text. */
export function readRaceFacts(doc: Document): RaceFacts {
  const name = clean(doc.querySelector("h1")?.textContent) || clean(doc.title).replace(/\s*\|\s*UCI\s*$/, "");
  const facts: RaceFacts = { name };
  const body = spacedText(doc.body);
  const cm = /Class\s+(\d\.[A-Za-z0-9]+)\s*-\s*([^-]+?)\s*-\s*([^W]+?)\s+(?:Website|Email|FINAL|Races|Final)/.exec(body);
  if (cm) {
    facts.class = cm[1];
    facts.classText = cm[1] + " - " + cm[2]!.trim() + " - " + cm[3]!.trim();
  } else {
    const c2 = /Class\s+(\d\.[A-Za-z0-9]+)/.exec(body);
    if (c2) facts.class = c2[1];
  }
  const dm = /(\d{1,2} [A-Z][a-z]{2}(?: - \d{1,2} [A-Z][a-z]{2})? \d{4})/.exec(body);
  if (dm) facts.dates = dm[1];
  return facts;
}

/**
 * The result tables that are open on the page. Only the rows that score points are kept (the user's rule:
 * top 50 at worst), together with the number of rows the table had.
 */
export function readOpenResults(doc: Document): { classifications: ResultClassification[]; kept: number } {
  const classifications: ResultClassification[] = [];
  let kept = 0;
  for (const tbl of Array.from(doc.querySelectorAll(".results-accordion .results-table"))) {
    const trs = Array.from(tbl.querySelectorAll("table tbody tr"));
    if (!trs.length) continue;
    const label = clean(tbl.closest(".panel")?.querySelector(".panel__label")?.textContent);
    const title = clean(tbl.querySelector(".results-table__title")?.textContent);
    const rows: ResultRow[] = [];
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (tds.length < 4) continue;
      const points = parseFloat(clean(tds[tds.length - 1]!.textContent).replace(",", "."));
      if (!(points > 0)) continue; // only the rows that score points
      const pos = parseInt(clean(tr.querySelector(".results-table__row-position")?.textContent), 10);
      rows.push({
        rank: pos > 0 ? pos : null,
        rider: (clean(tr.querySelector(".results-table__row-firstname")?.textContent) + " " + clean(tr.querySelector(".results-table__row-lastname")?.textContent)).trim(),
        team: clean(tr.querySelector(".results-table__row-team")?.textContent),
        age: parseInt(clean(tds[0]!.textContent), 10) || null,
        nation: clean(tds[1]!.textContent),
        result: clean(tds[2]!.textContent),
        points,
      });
    }
    classifications.push({ label, title, totalRows: trs.length, rows });
    kept += rows.length;
  }
  return { classifications, kept };
}
