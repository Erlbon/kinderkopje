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
        throw new Error("not a capture file (use the bookmark to make one)");
      }
      const r = addCapture(store.cube, parsed);
      lines.push(
        f.name + ": " + r.added + " rankings added, " + r.replaced + " replaced" + (r.competitions ? ", " + r.competitions + " competitions" : "") + (r.events ? ", " + r.events + " event lists" : "") + (r.races ? ", " + r.races + " event results" : "") +
          (r.skipped.length ? ", skipped: " + r.skipped.join("; ") : ""),
      );
    } catch (e) {
      lines.push(f.name + ": " + (e instanceof Error ? e.message : "could not read this file"));
    }
  }
  try {
    await store.saveCube();
  } catch (e) {
    // what was read is on the page, but it is not in the stored database: say so
    lines.push("NOT SAVED to the database: " + (e instanceof Error ? e.message : String(e)));
  }
  return lines;
}
