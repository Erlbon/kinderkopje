import { queueByRace } from "./cube";
import type { Cube } from "./cube";

/**
 * A work package for a helper moderator: a list of race editions to save from uci.org, packed into a link.
 * The helper opens help.html with the package in the address; nothing is sent anywhere.
 */

export interface AssignedRace {
  year: number;
  uciId: number;
  name: string;
}

export interface Assignment {
  v: 1;
  title?: string; // "Pelotonic: help collect UCI results (part 2 of 5)"
  note?: string; // where to send the result file
  races: AssignedRace[];
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function assignmentToJson(a: Assignment): string {
  return JSON.stringify(a);
}

/** The assignment as plain text safe for an address: base64url of its UTF-8 JSON. */
export function encodeAssignment(a: Assignment): string {
  return toBase64Url(new TextEncoder().encode(assignmentToJson(a)));
}

/** Check an assignment given as JSON text; throws a readable message for anything that is not one. */
export function parseAssignmentJson(json: string): Assignment {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error("this link's work package cannot be read: ask for a new link");
  }
  const a = obj as Partial<Assignment> | null;
  if (!a || a.v !== 1 || !Array.isArray(a.races)) throw new Error("this link is not a Pelotonic work package");
  const races: AssignedRace[] = [];
  for (const r of a.races) {
    if (typeof r?.year === "number" && typeof r?.uciId === "number" && typeof r?.name === "string") {
      races.push({ year: r.year, uciId: r.uciId, name: r.name });
    }
  }
  if (!races.length) throw new Error("this work package has no races");
  const out: Assignment = { v: 1, races };
  if (typeof a.title === "string") out.title = a.title;
  if (typeof a.note === "string") out.note = a.note;
  return out;
}

/** Read and check an assignment from its link text (base64url of the UTF-8 JSON). */
export function decodeAssignment(text: string): Assignment {
  let json: string;
  try {
    json = new TextDecoder().decode(fromBase64Url(text.trim()));
  } catch {
    throw new Error("this link's work package cannot be read: ask for a new link");
  }
  return parseAssignmentJson(json);
}

/** What one helper gets: the pages to save, and the races they belong to (one name per race). */
export interface HelperPackage {
  races: AssignedRace[];
  raceNames: string[];
}

/**
 * Work packages for helpers. A helper gets whole races, with all their editions across the years, so that one
 * race is collected at a time. Only editions that still need capturing are included by default.
 * `racesPerHelper` is how many races each package holds; the last package may be smaller.
 */
export function assignByRace(
  cube: Cube,
  options: { years?: number[]; onlyMissing?: boolean; racesPerHelper?: number } = {},
): HelperPackage[] {
  const onlyMissing = options.onlyMissing ?? true;
  const per = Math.max(1, Math.floor(options.racesPerHelper ?? 10));
  const groups: { name: string; eds: AssignedRace[] }[] = [];
  for (const race of queueByRace(cube).races) {
    const eds = Object.values(race.editions)
      .filter((e) => (!options.years?.length || options.years.includes(e.year)) && (!onlyMissing || !e.captured))
      .sort((x, y) => y.year - x.year)
      .map((e) => ({ year: e.year, uciId: e.uciId, name: e.name }));
    if (eds.length) groups.push({ name: race.name, eds });
  }
  const out: HelperPackage[] = [];
  for (let i = 0; i < groups.length; i += per) {
    const part = groups.slice(i, i + per);
    out.push({ races: part.flatMap((g) => g.eds), raceNames: part.map((g) => g.name) });
  }
  return out;
}
