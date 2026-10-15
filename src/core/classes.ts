import { parse } from "yaml";
import { SeasonError } from "./types";

export interface RaceClass {
  code: string;
  name: string;
  kind: "oneday" | "stage" | "either"; // "either": no one-day/stage check (championships)
  rank: number; // 1 = highest
  men?: boolean; // false = women only
  women?: boolean; // false = men only
}

export function parseClasses(text: string): RaceClass[] {
  const list = parse(text) as unknown;
  if (!Array.isArray(list)) throw new SeasonError(["classes: not a list"]);
  const errors: string[] = [];
  const out: RaceClass[] = [];
  list.forEach((c: unknown, i: number) => {
    const o = c as Partial<RaceClass> | null;
    if (!o || typeof o.code !== "string" || typeof o.name !== "string" || (o.kind !== "oneday" && o.kind !== "stage" && o.kind !== "either")) {
      errors.push("classes[" + i + "]: needs string code, name and kind oneday|stage|either (quote codes like \"1.1\")");
      return;
    }
    out.push(o as RaceClass);
  });
  if (errors.length) throw new SeasonError(errors);
  return out;
}

/** "1.UWT" -> kind from the leading digit, even for codes not in the table. */
export function kindOfCode(code: string): "oneday" | "stage" | undefined {
  return code.startsWith("1.") ? "oneday" : code.startsWith("2.") ? "stage" : undefined;
}

/** Problems with a race's class, as plain-language warnings. */
export function classWarnings(code: string, isStageRace: boolean, classes: RaceClass[]): string[] {
  const out: string[] = [];
  const known = classes.find((c) => c.code === code);
  if (!known) out.push("class " + (code || "(empty)") + " is not in data/classes.yaml");
  const kind = known ? (known.kind === "either" ? undefined : known.kind) : kindOfCode(code);
  if (kind === "oneday" && isStageRace) out.push("class " + code + " is a one-day class but the race has stages");
  if (kind === "stage" && !isStageRace) out.push("class " + code + " is a stage-race class but the race has no stages");
  return out;
}
