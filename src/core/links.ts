import { parse as parseYaml } from "yaml";
import type { Category } from "./dataride";
import type { WikidataRace } from "./wikipedia";
import { normRaceName } from "./uci-hub";

/**
 * Where a race lives on the web: its official site, Wikipedia, social media and FirstCycling.
 * Links come from the race registry of the Threads tab, from Wikidata (after you have checked the match) and from
 * links typed in by hand.
 */

export type LinkKind = "website" | "wikipedia" | "wikidata" | "x" | "instagram" | "facebook" | "youtube" | "tiktok" | "firstcycling" | "other";

export interface RaceLink {
  kind: LinkKind;
  url: string;
  source: "registry" | "wikidata" | "manual";
  label?: string; // for kind "other"
}

export const LINK_LABELS: Record<LinkKind, string> = {
  website: "Official site",
  wikipedia: "Wikipedia",
  wikidata: "Wikidata",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  firstcycling: "FirstCycling",
  other: "Other",
};

/** Links by race: the key is the cleaned name plus the category (see linkKey), so it survives joins and renames. */
export type LinkStore = Record<string, RaceLink[]>;

export function linkKey(name: string, category: Category): string {
  return normRaceName(name) + "|" + category;
}

/** The kind of a social media link from the word a registry uses ("Instagram", "Twitter", "X" ...). */
export function socialKind(text: string): LinkKind {
  const t = text.trim().toLowerCase();
  if (t === "instagram") return "instagram";
  if (t === "facebook") return "facebook";
  if (t === "x" || t === "twitter") return "x";
  if (t === "youtube") return "youtube";
  if (t === "tiktok") return "tiktok";
  return "other";
}

/** A link's identity for telling duplicates: kind and address, ignoring case and a trailing slash. */
function same(a: RaceLink, b: RaceLink): boolean {
  const norm = (u: string) => {
    let s = u.trim().toLowerCase();
    while (s.endsWith("/")) s = s.slice(0, -1);
    return s.replace("http://", "https://").replace("://www.", "://").replace("://twitter.com", "://x.com");
  };
  return a.kind === b.kind && norm(a.url) === norm(b.url);
}

/** Add links, keeping the first of each duplicate (so a registry link wins over the same address from Wikidata). */
export function mergeLinks(...lists: RaceLink[][]): RaceLink[] {
  const out: RaceLink[] = [];
  for (const l of lists.flat()) if (l.url.trim() && !out.some((x) => same(x, l))) out.push({ ...l, url: l.url.trim() });
  return out;
}

export function parseLinkStore(json: string | undefined): LinkStore {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as LinkStore) : {};
  } catch {
    return {};
  }
}

export function addToLinkStore(store: LinkStore, key: string, links: RaceLink[]): LinkStore {
  return { ...store, [key]: mergeLinks(store[key] ?? [], links) };
}

export function removeFromLinkStore(store: LinkStore, keys: string[], link: RaceLink): LinkStore {
  const out: LinkStore = {};
  for (const [k, list] of Object.entries(store)) {
    const kept = keys.includes(k) ? list.filter((l) => !same(l, link)) : list;
    if (kept.length) out[k] = kept;
  }
  return out;
}

/** Links from the race registry YAML of the Threads tab (site, Wikipedia, FirstCycling and social media). */
export function linksFromRegistry(yamlText: string | undefined): LinkStore {
  const out: LinkStore = {};
  if (!yamlText) return out;
  let doc: unknown;
  try {
    doc = parseYaml(yamlText);
  } catch {
    return out;
  }
  if (!doc || typeof doc !== "object") return out;
  for (const entry of Object.values(doc as Record<string, Record<string, unknown>>)) {
    if (!entry || typeof entry !== "object" || typeof entry.name !== "string") continue;
    const category: Category = entry.category === "WE" ? "WE" : "ME";
    const links: RaceLink[] = [];
    const add = (kind: LinkKind, url: unknown, label?: string) => {
      if (typeof url === "string" && url.trim()) links.push({ kind, url: url.trim(), source: "registry", ...(label ? { label } : {}) });
    };
    add("website", entry.officialSite);
    add("wikipedia", entry.wikipedia);
    if (entry.firstcycling !== undefined && String(entry.firstcycling).trim()) add("firstcycling", "https://firstcycling.com/race.php?r=" + String(entry.firstcycling).trim());
    if (Array.isArray(entry.social)) {
      for (const s of entry.social as { text?: unknown; url?: unknown }[]) {
        const kind = socialKind(String(s?.text ?? ""));
        add(kind, s?.url, kind === "other" ? String(s?.text ?? "") : undefined);
      }
    }
    if (links.length) out[linkKey(entry.name, category)] = mergeLinks(out[linkKey(entry.name, category)] ?? [], links);
  }
  return out;
}

/** The links of one race: everything stored under any of its names (internal or external), merged. */
export function linksFor(race: { name: string; category: Category; names: { name: string }[] }, ...stores: LinkStore[]): RaceLink[] {
  const keys = new Set([linkKey(race.name, race.category), ...race.names.map((n) => linkKey(n.name, race.category))]);
  return mergeLinks(...stores.flatMap((s) => [...keys].map((k) => s[k] ?? [])));
}

// ------------------------------------------------------------------ matching a race with a Wikidata item

const WOMEN = ["women", "womens", "woman", "femmes", "femme", "feminin", "feminine", "femminile", "femenina", "donne", "dames", "ladies", "vrouwen", "frauen", "elite women"];
const OTHER_AGE = ["under", "u23", "u19", "junior", "juniors", "juniores", "espoirs", "beloften", "nieuwelingen", "jeugd", "cadets"];

const MARKS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

function words(text: string): string[] {
  return text.toLowerCase().normalize("NFD").replace(MARKS, "").split(/[^a-z0-9]+/).filter((w) => w !== "");
}

const RACE_WORDS = /cycl|bicycle|race|racing|road|stage|classic|tour|sport|competition/;
const YEAR = /^(19|20)[0-9]{2}$/;
// things that are not a race: a statue, a club, a team, an association ...
const NOT_A_RACE = ["monument", "statue", "memorial", "museum", "stadium", "club", "team", "association", "foundation", "company", "organisation", "organization"];

/** Share of two-letter pieces that two names have in common (0 to 1): tolerant of "Milano-Sanremo" against "Milan - San Remo". */
function similarity(a: string, b: string): number {
  const x = normRaceName(a);
  const y = normRaceName(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return 1;
  const pairs = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const px = pairs(x);
  const py = pairs(y);
  let shared = 0;
  for (const p of px) if (py.has(p)) shared++;
  return (2 * shared) / (px.size + py.size);
}

export interface Pick {
  candidate?: WikidataRace;
  score: number;
  confident: boolean; // a clear match: the best candidate is well ahead of the others
}

/**
 * The Wikidata item that is most likely the race itself, not one of its editions ("2019 Giro di Lombardia"), its
 * under-23 or junior race, or the race of the other sex. Nothing is saved from this alone: the match is shown for a
 * person to decide. `exclude` holds items that were already rejected for this race.
 */
export function pickCandidate(candidates: WikidataRace[], race: { name: string; category: Category }, exclude: string[] = []): Pick {
  const scored = candidates
    .filter((c) => !exclude.includes(c.id))
    .map((c, i) => {
      const label = words(c.label);
      const desc = words(c.description);
      const text = [...label, ...desc];
      const women = WOMEN.some((w) => text.includes(w) || (w.includes(" ") && (c.label + " " + c.description).toLowerCase().includes(w)));
      let score = similarity(c.label, race.name) * 10 - i * 0.3;
      const raceWords = words(race.name);
      if (label.some((w) => YEAR.test(w) && !raceWords.includes(w))) score -= 8; // an edition of the race, or one of its stages
      if (/edition/.test(c.description.toLowerCase())) score -= 6;
      if (!RACE_WORDS.test(c.description.toLowerCase())) score -= 8; // no description saying it is a race: not something to trust (an association, a club ...)
      if (OTHER_AGE.some((w) => label.includes(w))) score -= 12; // under 23, juniors: another race
      if (race.category === "WE" ? !women : women) score -= 12; // the other sex's race: no match is better than that one
      const lowDesc = c.description.toLowerCase();
      // an item that is a statue, a club or a team, not a race: unless the description also says it is a race or a classic
      if (words(c.label + " " + c.description).some((w) => NOT_A_RACE.includes(w)) && !/five monuments|race|classic/.test(lowDesc)) score -= 12;
      if (lowDesc.includes("five monuments")) score += 3;
      if (/one-day|stage race|cycling race|cycling competition/.test(c.description.toLowerCase())) score += 2;
      if (c.officialSite) score += 1;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 6) return { score: best?.score ?? 0, confident: false };
  const gap = best.score - (scored[1]?.score ?? -99);
  return { candidate: best.c, score: best.score, confident: best.score >= 11 && gap >= 3 };
}

/** The links a Wikidata match brings: its page, the official site, Wikipedia and the social media it knows. */
export function linksFromCandidate(c: WikidataRace): RaceLink[] {
  const out: RaceLink[] = [];
  if (c.officialSite) out.push({ kind: "website", url: c.officialSite, source: "wikidata" });
  if (c.wikipedia) out.push({ kind: "wikipedia", url: c.wikipedia, source: "wikidata" });
  for (const s of c.social ?? []) out.push({ kind: socialKind(s.text), url: s.url, source: "wikidata", ...(socialKind(s.text) === "other" ? { label: s.text } : {}) });
  out.push({ kind: "wikidata", url: "https://www.wikidata.org/wiki/" + c.id, source: "wikidata" });
  return mergeLinks(out);
}
