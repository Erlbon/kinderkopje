import { addCapture, mergeRaceResult } from "../core";
import { readUploaded } from "./saved-pages";
import type { Store } from "./store";

/**
 * Open files into the database: race pages saved from uci.org, and capture files (made by the bookmarks, or
 * the results file a helper moderator sends back). Returns one line per file.
 */
export async function importCaptureFiles(store: Store, files: File[]): Promise<string[]> {
  const lines: string[] = [];
  for (const f of files) {
    try {
      const u = await readUploaded(f);
      if (u.kind === "race") {
        mergeRaceResult(store.cube, u.race);
        const rows = u.race.classifications.reduce((n, c) => n + c.rows.length, 0);
        lines.push(f.name + ": " + u.race.name + " (" + u.race.year + "), " + rows + " point-scoring rows");
      } else {
        const r = addCapture(store.cube, u.file);
        lines.push(
          f.name + ": " + r.added + " rankings added, " + r.replaced + " replaced" + (r.races ? ", " + r.races + " race results" : "") +
            (r.skipped.length ? ", skipped: " + r.skipped.join("; ") : ""),
        );
      }
    } catch (e) {
      lines.push(f.name + ": " + (e instanceof Error ? e.message : "could not read this file"));
    }
  }
  await store.saveCube();
  return lines;
}
