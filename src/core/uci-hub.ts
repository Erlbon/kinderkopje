import { eachDay } from "./dates";
import { slugify } from "./ical";
import { RegistryRace, Season, SeasonRace } from "./types";

/**
 * Reader for a saved UCI competition hub page (for example "2027 UCI WorldTour", tab "Races & Results").
 * The calendar is embedded in the page as structured data, so a moderator saves the page from their own
 * browser (Save as, HTML) and drops the file into the tool. Nothing is fetched from uci.org.
 */

export interface UciHubRace {
  name: string;
  venue: string;
  country: string;
  start: string; // ISO
  end: string; // ISO
  uciId: number; // the number at the end of /competition-details/<year>/ROA/<id>
}

export interface UciHub {
  title: string; // "2027 UCI WorldTour"
  year: number;
  races: UciHubRace[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "08 May - 30 May 2027" or "31 Jan 2027" -> ISO start and end. */
export function parseUciDates(text: string): { start: string; end: string } | undefined {
  const range = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*(?:\s+(\d{4}))?\s*-\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(text);
  if (range) {
    const m1 = MONTHS[range[2]!.toLowerCase()];
    const m2 = MONTHS[range[5]!.toLowerCase()];
    const y2 = Number(range[6]);
    if (!m1 || !m2) return undefined;
    const y1 = range[3] ? Number(range[3]) : m1 > m2 ? y2 - 1 : y2; // a December start in a January-ending range
    return { start: y1 + "-" + pad(m1) + "-" + pad(+range[1]!), end: y2 + "-" + pad(m2) + "-" + pad(+range[4]!) };
  }
  const one = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(text);
  if (!one) return undefined;
  const m = MONTHS[one[2]!.toLowerCase()];
  if (!m) return undefined;
  const d = one[3] + "-" + pad(m) + "-" + pad(+one[1]!);
  return { start: d, end: d };
}

/** Read the embedded calendar of a saved hub page. Duplicate rows (races that span two months) are merged. */
export function parseUciHub(html: string): UciHub {
  const m = /data-component="HubsModule"\s+data-props="(.*?)"\s*>/s.exec(html);
  if (!m) throw new Error("This does not look like a UCI competition hub page (no calendar data found).");
  const props = JSON.parse(unescapeHtml(m[1]!)) as {
    competitionHubHeader?: { competitionTitle?: string };
    tabs?: { tabs?: { slug: string; content?: string }[] };
  };
  const tab = props.tabs?.tabs?.find((t) => t.slug === "races-results");
  if (!tab?.content) throw new Error("The page has no Races & Results tab; save the page with that tab open.");
  const content = unescapeHtml(tab.content);
  const title = props.competitionHubHeader?.competitionTitle ?? "";
  const races = new Map<number, UciHubRace>();
  for (const pm of content.matchAll(/data-prop-months="(.*?)"(?:\s+data-|\s*>)/gs)) {
    const months = JSON.parse(unescapeHtml(pm[1]!)) as {
      items: { items: { name: string; venue: string; country: string; dates: string; detailsLink: { url: string } }[] }[];
    }[];
    for (const mo of months) {
      for (const day of mo.items) {
        for (const it of day.items) {
          const id = /\/(\d+)\s*$/.exec(it.detailsLink.url);
          const dates = parseUciDates(it.dates);
          if (!id || !dates) continue;
          races.set(Number(id[1]), {
            name: it.name.trim(),
            venue: it.venue.trim(),
            country: it.country,
            start: dates.start,
            end: dates.end,
            uciId: Number(id[1]),
          });
        }
      }
    }
  }
  const year = Number(/\b(20\d\d)\b/.exec(title)?.[1] ?? [...races.values()][0]?.start.slice(0, 4));
  return { title, year, races: [...races.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)) };
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g"), "")
    .toLowerCase()
    .replace(/\b(men|women|elite|santos|mapei|hauts-de-france|la|il|de|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * A season draft from a hub page. The class follows the hub (WorldTour men: 1.UWT / 2.UWT, women: WWT,
 * ProSeries: Pro) and whether the race lasts more than one day. Multi-day races get one stage per day,
 * to be replaced by the real stage list (rest days included) later. Races already in the registry keep
 * their id; new ones are named from the UCI name.
 */
export function uciHubToSeason(hub: UciHub, registry: Record<string, RegistryRace> = {}): Season {
  const women = /women/i.test(hub.title);
  const level = /pro\s*series/i.test(hub.title) ? "Pro" : women ? "WWT" : "UWT";
  const races: SeasonRace[] = [];
  const used = new Set<string>();
  for (const r of hub.races) {
    const multi = r.end > r.start;
    const cls = (multi ? "2." : "1.") + level;
    const nameWomen = /\bwomen\b/i.test(r.name);
    const category = women || nameWomen ? "WE" : "ME";
    const display = r.name.replace(/\s*-\s*(Men|Women)\s*$/i, "").trim();
    const known = Object.entries(registry).find(
      ([, g]) => g.category === category && normName(g.name) === normName(display),
    )?.[0];
    let id = known ?? slugify(display) + "-" + category.toLowerCase();
    for (let n = 2; used.has(id); n++) id = (known ?? slugify(display) + "-" + category.toLowerCase()) + "-" + n;
    used.add(id);
    const base: SeasonRace = { race: id, class: cls };
    if (!known) {
      base.name = display;
      base.category = category;
    }
    base.uciId = r.uciId;
    if (!multi) races.push({ ...base, date: r.start });
    else races.push({ ...base, stages: eachDay(r.start, r.end).map((date, i) => ({ n: i + 1, date })) });
  }
  return { season: hub.year, races };
}

export interface UciCompetition {
  uciId?: number;
  name: string;
  dates: { start: string; end: string } | undefined;
  country: string;
  venue: string;
  class: string; // "1.Pro"
  classText: string; // "1.Pro - 1 day - UCI ProSeries"
  website?: string; // the official race site
  email?: string; // organiser contact; only read when asked for (personal data)
  categories: string[]; // "Men Elite", "Women Elite", ...
  eventCodes: string[]; // result event codes (D2EV...)
}

/**
 * Read the metadata of a saved UCI competition page (/competition-details/<year>/ROA/<id>).
 * The names of officials are never read. The organiser's contact email is read only with
 * `options.contact`: it is often a named person's work address, so the default leaves it out.
 */
export function parseUciCompetition(html: string, uciId?: number, options: { contact?: boolean } = {}): UciCompetition {
  const m = /data-component="CompetitionDetailsModule"\s+data-props="(.*?)"\s*>/s.exec(html);
  if (!m) throw new Error("This does not look like a UCI competition page (no race details found).");
  const d = JSON.parse(unescapeHtml(m[1]!)) as {
    competitionDetails?: {
      name?: string;
      dates?: string;
      venue?: string;
      country?: string;
      competitionClass?: string;
      website?: { url?: string };
      email?: { url?: string };
    };
    schedule?: { items?: { races?: { category?: string }[] }[] };
    results?: { accordion?: { results?: { eventCode?: string }[] }[] };
  };
  const c = d.competitionDetails ?? {};
  const classText = c.competitionClass ?? "";
  const cats = new Set<string>();
  for (const it of d.schedule?.items ?? []) for (const r of it.races ?? []) if (r.category) cats.add(r.category);
  const codes: string[] = [];
  for (const a of d.results?.accordion ?? []) for (const r of a.results ?? []) if (r.eventCode) codes.push(r.eventCode);
  const website = c.website?.url;
  const mail = /^mailto:(.+)$/i.exec(c.email?.url ?? "")?.[1];
  return {
    uciId,
    name: (c.name ?? "").trim(),
    dates: c.dates ? parseUciDates(c.dates) : undefined,
    country: c.country ?? "",
    venue: c.venue ?? "",
    class: classText.split(" - ")[0]?.trim() ?? "",
    classText,
    website: website && /^https?:\/\//.test(website) ? website : undefined,
    email: options.contact ? mail : undefined,
    categories: [...cats],
    eventCodes: codes,
  };
}

/** Add what a competition page knows to the race registry: the official site (kept if one is already there). */
export function registryFromCompetition(comp: UciCompetition, existing?: RegistryRace): RegistryRace | undefined {
  if (!existing && !comp.name) return undefined;
  const category = comp.categories.some((c) => /women/i.test(c)) && !comp.categories.some((c) => /men elite/i.test(c) && !/women/i.test(c)) ? "WE" : "ME";
  const entry: RegistryRace = existing ? { ...existing } : { name: comp.name.replace(/\s+(Elite|Men|Women)\s*$/i, "").trim(), category };
  if (comp.website && !entry.officialSite) entry.officialSite = comp.website;
  if (comp.email && !entry.contactEmail) entry.contactEmail = comp.email;
  return entry;
}
