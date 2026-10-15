import { RaceClass, classWarnings } from "./classes";
import { addDays, ddmm, yearOf } from "./dates";
import {
  Column,
  InfoLink,
  InfoRowDef,
  InfoValue,
  Leg,
  Profile,
  RegistryRace,
  Season,
  SeasonRace,
  Stage,
  Thread,
} from "./types";

const NL = String.fromCharCode(10);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Ctx {
  profile: Profile;
  race: SeasonRace;
  reg: RegistryRace | undefined;
  name: string;
  category: string;
  year: number;
  warnings: string[];
}

export function fmtDate(iso: string, format: string): string {
  const wd = WEEKDAYS[new Date(iso + "T00:00:00Z").getUTCDay()]!;
  return format
    .replace("ddd", wd)
    .replace("dd", iso.slice(8, 10))
    .replace("mm", iso.slice(5, 7));
}

function fill(tpl: string, vars: Record<string, string | number>): string {
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  return out.replace(/ {2,}/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}

function mdLink(l: InfoLink): string {
  return l.url ? "[" + l.text + "](" + l.url + ")" : l.text;
}

function cell(col: Column, leg: Leg & { n?: number }, ctx: Ctx, what: string): string {
  const miss = (field: string): string => {
    ctx.warnings.push(what + ": " + field + " missing");
    return ctx.profile.placeholder;
  };
  switch (col.field) {
    case "date":
      return fmtDate(leg.date, col.format ?? "dd.mm");
    case "stage":
      if (leg.n === undefined) return miss("stage number");
      return leg.stageUrl ? "[" + leg.n + "](" + leg.stageUrl + ")" : String(leg.n);
    case "route": {
      if (!leg.from || !leg.to) return miss("route (from > to)");
      const t = leg.from + " > " + leg.to;
      return leg.routeUrl ? "[" + t + "](" + leg.routeUrl + ")" : t;
    }
    case "length":
      return leg.length === undefined ? miss("length") : leg.length + "km";
    case "altitude":
      return leg.altitude === undefined ? miss("altitude") : leg.altitude + "m";
    case "type":
      return leg.type ?? miss("type");
    case "finish":
      return leg.finish ?? miss("finish");
    case "time": {
      if (!leg.start) return miss("time");
      const tz = ctx.race.tz ?? ctx.reg?.tz ?? "CET";
      const sep = col.format ?? " – ";
      return (leg.end ? leg.start + sep + leg.end : leg.start) + " " + tz;
    }
  }
}

function alignCell(a: Column["align"]): string {
  return a === "r" ? "---:" : a === "c" ? ":-:" : a === "l" ? ":-" : "---";
}

function table(cols: Column[], rows: (Leg & { n?: number })[], ctx: Ctx, what: string): string {
  const head = "|" + cols.map((c) => c.header).join("|") + "|";
  const sep = "|" + cols.map((c) => alignCell(c.align)).join("|") + "|";
  const body = rows.map(
    (leg) => "|" + cols.map((c) => cell(c, leg, ctx, what)).join("|") + "|",
  );
  return [head, sep, ...body].join(NL);
}

function autoItems(row: InfoRowDef, ctx: Ctx): InfoLink[] {
  const out: InfoLink[] = [];
  const r = ctx.reg;
  for (const a of row.auto ?? []) {
    if (a === "official" && r?.officialSite) out.push({ text: "Official Site", url: r.officialSite });
    if (a === "wikipedia" && r?.wikipedia) out.push({ text: "Wikipedia", url: r.wikipedia });
    if (a === "startlistFc" && r?.firstcycling !== undefined) {
      const k = r.firstcyclingClass ?? 8;
      out.push({
        text: "Startlist FC",
        url: "https://firstcycling.com/race.php?r=" + r.firstcycling + "&y=" + ctx.year + "&k=" + k,
      });
    }
    if (a === "pcsLive" && r?.pcs) {
      out.push({
        text: "PCS",
        url: "https://www.procyclingstats.com/race/" + r.pcs + "/" + ctx.year + "/result/live",
      });
    }
    if (a === "social" && r?.social) out.push(...r.social);
  }
  return out;
}

function infoTable(kind: "oneday" | "stage", leg: Leg, ctx: Ctx): string {
  const lines = ["|||", "|-|-|"];
  for (const row of ctx.profile.infoRows) {
    if (row.kinds && !row.kinds.includes(kind)) continue;
    const layers: (InfoValue | undefined)[] = [ctx.race.info?.[row.id], leg.info?.[row.id]];
    let md: string | undefined;
    const links: InfoLink[] = autoItems(row, ctx);
    for (const v of layers) {
      if (!v) continue;
      if (Array.isArray(v)) links.push(...v);
      else md = v.md;
    }
    const text = md ?? links.map(mdLink).join(" / ");
    if (!text) {
      if (row.optional) continue;
      ctx.warnings.push(row.label + ": empty");
      lines.push("|" + row.label + "|" + ctx.profile.placeholder + "|");
    } else {
      lines.push("|" + row.label + "|" + text + "|");
    }
  }
  for (const x of [...(ctx.race.extra ?? []), ...(leg.extra ?? [])]) {
    const text = Array.isArray(x.value) ? x.value.map(mdLink).join(" / ") : x.value.md;
    lines.push("|" + x.label + "|" + text + "|");
  }
  return lines.join(NL);
}

/** Free-text notes of the race, then of the leg, appended under the tables. */
function notes(leg: Leg, ctx: Ctx): string {
  const parts = [ctx.race.notes, leg.notes].filter((n): n is string => !!n && n.trim() !== "");
  return parts.length ? NL + NL + parts.map((p) => p.trim()).join(NL + NL) : "";
}

function mkCtx(profile: Profile, race: SeasonRace, registry: Record<string, RegistryRace>, season: Season): Ctx {
  const reg = registry[race.race];
  const first = race.stages?.[0]?.date ?? race.date!;
  return {
    profile,
    race,
    reg,
    name: race.name ?? reg!.name,
    category: race.category ?? reg!.category,
    year: typeof season.season === "number" ? season.season : yearOf(first),
    warnings: [],
  };
}

function vars(ctx: Ctx, extra: Record<string, string | number> = {}): Record<string, string | number> {
  return {
    year: ctx.year,
    name: ctx.name,
    tag: ctx.race.category !== undefined ? ctx.race.category : (ctx.reg?.titleTag ?? ctx.category),
    class: ctx.race.class,
    ...extra,
  };
}

function thread(
  ctx: Ctx,
  id: string,
  kind: Thread["kind"],
  title: string,
  body: string,
  first: string,
  last: string,
): Thread {
  return {
    id,
    kind,
    title,
    body: body + NL,
    firstDate: first,
    lastDate: last,
    suggestedPost: addDays(first, -1),
    warnings: ctx.warnings,
  };
}

export function renderRace(
  profile: Profile,
  registry: Record<string, RegistryRace>,
  season: Season,
  race: SeasonRace,
): Thread[] {
  const ctx = mkCtx(profile, race, registry, season);
  const out: Thread[] = [];
  const id = race.race;

  if (!race.stages) {
    // A one-day race is its own leg. Take only the leg's own route fields so the
    // race-level info/extra/notes are not applied a second time.
    const leg: Leg = {
      date: race.date!,
      from: race.from,
      to: race.to,
      routeUrl: race.routeUrl,
      stageUrl: race.stageUrl,
      length: race.length,
      altitude: race.altitude,
      type: race.type,
      finish: race.finish,
      start: race.start,
      end: race.end,
    };
    const title = fill(profile.titles.oneday, vars(ctx));
    const body =
      table(profile.tables.oneday, [leg], ctx, "route") + NL + NL + infoTable("oneday", leg, ctx) + notes(leg, ctx);
    out.push(thread(ctx, id, "race", title, body, leg.date, leg.date));
    return out;
  }

  const stages = [...race.stages].sort((a, b) => a.date.localeCompare(b.date));
  const first = stages[0]!.date;
  const last = stages[stages.length - 1]!.date;

  if (race.mega) {
    const mctx = mkCtx(profile, race, registry, season);
    const title = fill(profile.titles.mega, vars(mctx));
    const body =
      table(profile.tables.stage, stages, mctx, "stages") +
      NL + NL + infoTable("stage", {} as Leg, mctx) + NL + NL + profile.megaIntro;
    out.push(thread(mctx, id + "-mega", "mega", title, body, first, last));
  }

  for (const st of stages) {
    const sctx = mkCtx(profile, race, registry, season);
    const title = fill(profile.titles.stage, vars(sctx, { stage: st.n }));
    const body =
      table(profile.tables.stage, [st], sctx, "stage " + st.n) +
      NL + NL + infoTable("stage", st, sctx) + notes(st, sctx);
    out.push(thread(sctx, id + "-stage-" + st.n, "stage", title, body, st.date, st.date));
  }

  (race.restDays ?? []).forEach((date, i) => {
    const rctx = mkCtx(profile, race, registry, season);
    const title = fill(profile.titles.rest, vars(rctx, { n: i + 1 }));
    rctx.warnings.push("recap text: write it");
    const body = profile.restIntro + NL + NL + profile.restFooter;
    out.push(thread(rctx, id + "-rest-" + (i + 1), "rest", title, body, date, date));
  });

  return out;
}

/** All threads of a season in posting order. */
export function renderSeason(
  profile: Profile,
  registry: Record<string, RegistryRace>,
  season: Season,
  classes?: RaceClass[],
): Thread[] {
  const all: Thread[] = [];
  for (const race of season.races) {
    const extra = classes ? classWarnings(race.class, !!race.stages, classes) : [];
    for (const t of renderRace(profile, registry, season, race)) {
      t.warnings.push(...extra);
      all.push(t);
    }
  }
  const rank = { mega: 0, race: 1, stage: 1, rest: 1 } as const;
  return all
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        a.t.firstDate.localeCompare(b.t.firstDate) ||
        rank[a.t.kind] - rank[b.t.kind] ||
        a.i - b.i,
    )
    .map((x) => x.t);
}

export type { Stage };
export { ddmm };
