import { CaptureFile, addCapture } from "../core";
import type { Store } from "./store";

/** Open capture files (made by the bookmarks) into the database. Returns one line per file. */
export async function importCaptureFiles(store: Store, files: File[]): Promise<string[]> {
  const lines: string[] = [];
  for (const f of files) {
    try {
      let parsed: CaptureFile;
      try {
        parsed = JSON.parse(await f.text()) as CaptureFile;
      } catch {
        throw new Error("not a capture file (a page saved from uci.org does not contain the results; use the bookmark)");
      }
      const r = addCapture(store.cube, parsed);
      lines.push(
        f.name + ": " + r.added + " rankings added, " + r.replaced + " replaced" + (r.races ? ", " + r.races + " race results" : "") +
          (r.skipped.length ? ", skipped: " + r.skipped.join("; ") : ""),
      );
    } catch (e) {
      lines.push(f.name + ": " + (e instanceof Error ? e.message : "could not read this file"));
    }
  }
  await store.saveCube();
  return lines;
}
