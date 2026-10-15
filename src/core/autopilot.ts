/**
 * What the capture bookmark does on a DataRide page after you press it, beyond reading: it clicks the page's own
 * controls (a closed row's triangle, the "next page" button) the way you would, one click at a time with a pause
 * in between, and stops at once when asked. It never leaves the page you pressed it on and never follows a link.
 * The clicks make the page load its data as it does for you; nothing here sends a request of its own.
 */

export interface PilotEnv {
  sleep(ms: number): Promise<void>;
}

export const realEnv: PilotEnv = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Wait until `cond` holds; false when it did not within `timeoutMs`. */
export async function waitFor(cond: () => boolean, env: PilotEnv, timeoutMs = 8000, every = 200): Promise<boolean> {
  let waited = 0;
  while (waited <= timeoutMs) {
    if (cond()) return true;
    await env.sleep(every);
    waited += every;
  }
  return cond();
}

function disabled(el: Element): boolean {
  const li = el.closest("li");
  return (
    el.classList.contains("k-state-disabled") ||
    el.classList.contains("k-disabled") ||
    el.getAttribute("aria-disabled") === "true" ||
    el.hasAttribute("disabled") ||
    !!li?.classList.contains("k-state-disabled")
  );
}

/** The "next page" control of the page's table, when there is one that can be pressed. */
export function findNext(doc: Document): HTMLElement | null {
  const byTitle = Array.from(doc.querySelectorAll("a[title], a[aria-label], button[title], button[aria-label]")).filter((e) =>
    /next/i.test((e.getAttribute("title") ?? "") + " " + (e.getAttribute("aria-label") ?? "")),
  );
  let next: Element | undefined = byTitle[0];
  if (!next) {
    // the pager's four arrows in order: first, previous, next, last
    const navs = Array.from(doc.querySelectorAll("a.k-pager-nav, button.k-pager-nav")).filter((e) => !/k-pager-numbers/.test(e.className));
    if (navs.length === 4) next = navs[2];
  }
  return next && !disabled(next) ? (next as HTMLElement) : null;
}

/** Rows that can be opened but are closed. */
export function findClosedRows(doc: Document): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const tr of Array.from(doc.querySelectorAll("tr.k-master-row"))) {
    const toggle = tr.querySelector("td.k-hierarchy-cell a, td.k-hierarchy-cell button");
    if (!toggle) continue;
    const detail = tr.nextElementSibling?.classList.contains("k-detail-row") ? (tr.nextElementSibling as HTMLElement) : null;
    const closed = toggle.getAttribute("aria-expanded") === "false" || !detail || detail.style.display === "none" || detail.hidden;
    if (closed) out.push(toggle as HTMLElement);
  }
  return out;
}

/** A short text that changes when the table shows other rows. */
export function tableSignature(doc: Document): string {
  const rows = Array.from(doc.querySelectorAll("tbody tr"));
  return rows.length + "|" + rows.slice(0, 3).map((r) => (r.textContent ?? "").replace(/\s+/g, " ").trim()).join("|");
}

export interface PilotOptions {
  pause?: number; // ms between clicks
  stop?: () => boolean;
  progress?: (text: string) => void;
}

/** Open every closed row of the table (the ones on this page of the table). Returns how many were opened. */
export async function expandAll(doc: Document, env: PilotEnv, o: PilotOptions = {}): Promise<number> {
  const pause = o.pause ?? 600;
  let opened = 0;
  for (let guard = 0; guard < 200; guard++) {
    if (o.stop?.()) break;
    const closed = findClosedRows(doc);
    if (!closed.length) break;
    const before = doc.querySelectorAll("tr.k-detail-row").length + "|" + doc.querySelectorAll("a[href*='/EventResults/']").length;
    closed[0]!.click();
    opened++;
    o.progress?.("Opening row " + opened + " (" + (closed.length - 1) + " left on this page) ...");
    // wait until the row's detail has appeared (links or a detail row), then pause
    await waitFor(() => doc.querySelectorAll("tr.k-detail-row").length + "|" + doc.querySelectorAll("a[href*='/EventResults/']").length !== before || findClosedRows(doc).length < closed.length, env, 6000);
    await env.sleep(pause);
    if (opened >= 150) break;
  }
  return opened;
}

/**
 * Read the page, go to the next page of the table, read again ... while `again` says the next page is worth reading.
 * `read` is called for every page, including the first. Returns how many pages were read.
 */
export async function pageThrough<T>(
  doc: Document,
  env: PilotEnv,
  o: PilotOptions & { read: () => T | Promise<T>; again: (r: T) => boolean; maxPages: number },
): Promise<number> {
  const pause = o.pause ?? 1200;
  let pages = 0;
  for (;;) {
    const r = await o.read();
    pages++;
    if (o.stop?.() || pages >= o.maxPages || !o.again(r)) break;
    const next = findNext(doc);
    if (!next) break;
    const sig = tableSignature(doc);
    o.progress?.("Page " + pages + " read; going to page " + (pages + 1) + " ...");
    next.click();
    const changed = await waitFor(() => tableSignature(doc) !== sig, env, 10000);
    if (!changed) break; // the table did not change: nothing more to read
    await env.sleep(pause);
  }
  return pages;
}
