import type { Database } from "sql.js";
import { openDatabase } from "./cube-db";

/** Where people can ask for something to be removed from the public dataset. */
export const TAKEDOWN_URL = "https://github.com/Erlbon/pelotonic/issues";

export const PUBLIC_CREDITS =
  "Rankings and race results are published by the Union Cycliste Internationale (UCI) on uci.org and dataride.uci.ch; team levels come from Wikipedia (CC BY-SA 4.0). " +
  "Only names, nations, rider ages (as DataRide shows them at the race), places, points, team names, race names and race facts are included: no layout, no photos. " +
  "To have something removed, open an issue at " + TAKEDOWN_URL + ".";

/**
 * A copy of the database that is safe to publish: only the ranking and result tables, with the private parts
 * (saved texts, the capture queue, who captured a race and when) emptied and the file rewritten so that
 * nothing of them stays in unused pages. It keeps the schema, so any copy opens like a normal Pelotonic file.
 */
export function makePublicCopy(SQL: { Database: new (data?: ArrayLike<number>) => Database }, db: Database): Uint8Array {
  const copy = openDatabase(SQL, db.export());
  try {
    copy.exec("DELETE FROM kv; DELETE FROM queue_race; UPDATE race_result SET contributor = NULL, captured_at = NULL;");
    // only the races that have results: a race that is only in the capture queue is left out, with its names
    copy.exec("DELETE FROM race_name WHERE race_id NOT IN (SELECT race_id FROM race_result WHERE race_id IS NOT NULL); DELETE FROM race WHERE race_id NOT IN (SELECT race_id FROM race_result WHERE race_id IS NOT NULL);");
    copy.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('public', '1')");
    copy.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('credits', ?)", [PUBLIC_CREDITS]);
    copy.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('made', ?)", [new Date().toISOString().slice(0, 10)]);
    copy.exec("VACUUM");
    return copy.export();
  } finally {
    copy.close();
  }
}

/** Text of the credits of a public dataset file, if it is one. */
export function publicCredits(db: Database): string | undefined {
  const r = db.exec("SELECT value FROM meta WHERE key = 'credits'");
  return r.length ? String(r[0]!.values[0]![0]) : undefined;
}
