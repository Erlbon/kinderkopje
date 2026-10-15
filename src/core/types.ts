/** A link in an info row. No url = plain text. */
export interface InfoLink {
  text: string;
  url?: string;
}

/** An info-row value: a list of links/text joined with " / ", or raw markdown. */
export type InfoValue = InfoLink[] | { md: string };

/**
 * A race that comes back every year (per category: the men's and women's
 * editions are separate entries because their ids and slugs differ).
 * Lives in data/peloton/races.yaml and is reused across seasons.
 */
export interface RegistryRace {
  name: string;
  category: string; // ME, WE, ...
  titleTag?: string; // text for {tag} in titles; default = category, "" = none
  officialSite?: string;
  wikipedia?: string;
  pcs?: string; // procyclingstats slug, e.g. strade-bianche-donne
  firstcycling?: number | string; // firstcycling race.php?r=
  firstcyclingClass?: number | string; // firstcycling race.php?k= (default 8)
  social?: InfoLink[];
  /** Info-row items that carry over every year, per row id (information, previews, ...). */
  info?: Record<string, InfoValue>;
  tz?: string; // default time zone label, e.g. CET
}

/** One racing day: a one-day race or one stage. */
export interface Leg {
  date: string; // ISO yyyy-mm-dd
  from?: string;
  to?: string;
  routeUrl?: string;
  stageUrl?: string; // official page of the stage (links the stage number)
  length?: number; // km
  altitude?: number; // metres climbed
  type?: string;
  finish?: string;
  start?: string; // "11:45"
  end?: string; // "16:43"
  info?: Record<string, InfoValue>; // adds to / replaces standard info rows
  extra?: ExtraRow[]; // additional rows after the standard ones
  notes?: string; // free markdown appended below the tables
}

export interface Stage extends Leg {
  n: number;
}

/** One race in one season (year-specific facts). */
export interface SeasonRace extends Partial<Leg> {
  race: string; // registry id (or a new id when name+category are given here)
  name?: string; // overrides/replaces the registry entry
  category?: string;
  class: string; // 1.UWT, 2.Pro, ...
  stages?: Stage[]; // present = stage race
  // race-level extra/notes apply to every thread of the race (via Leg's optional fields)
  restDays?: string[]; // ISO dates that get a rest-day thread (Grand Tours)
  mega?: boolean; // also a thread for the whole race
  tz?: string;
  roadbook?: string;
  info?: Record<string, InfoValue>; // extra/override per info row
}

/** An extra info row for one race or stage (beyond the standard rows). */
export interface ExtraRow {
  label: string;
  value: InfoValue;
}

export interface Season {
  season: number | string;
  races: SeasonRace[];
}

export type ColumnField =
  | "date"
  | "stage"
  | "route"
  | "length"
  | "type"
  | "altitude"
  | "finish"
  | "time";

export interface Column {
  header: string;
  field: ColumnField;
  align?: "l" | "r" | "c";
  /** date: tokens ddd dd mm ("ddd. dd/mm" -> "Thu. 09/07"); time: the separator ("-" or " – ") */
  format?: string;
}

/** Info-row items built from the race registry / season data when present. */
export type AutoItem = "official" | "wikipedia" | "startlistFc" | "pcsLive" | "social";

export interface InfoRowDef {
  id: string;
  label: string;
  optional?: boolean; // omitted when empty instead of showing the placeholder
  kinds?: ("oneday" | "stage")[]; // default: both
  auto?: AutoItem[];
}

export interface Profile {
  id: string;
  name: string;
  titles: { oneday: string; stage: string; rest: string; mega: string };
  tables: { oneday: Column[]; stage: Column[] };
  infoRows: InfoRowDef[];
  restIntro: string; // placeholder where the moderator writes the recap
  restFooter: string; // standard closing block (wiki, FAQ, dictionary links)
  megaIntro: string;
  defaultIntro: string;
  placeholder: string; // shown where a value is still missing
}

export type ThreadKind = "race" | "stage" | "rest" | "mega";

export interface Thread {
  id: string;
  kind: ThreadKind;
  title: string;
  body: string;
  firstDate: string;
  lastDate: string;
  suggestedPost: string; // ISO date
  warnings: string[]; // values still to fill in
}

export class SeasonError extends Error {
  constructor(public errors: string[]) {
    super(errors.join(String.fromCharCode(10)));
  }
}
