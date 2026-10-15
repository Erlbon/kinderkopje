import { CaptureFile, addCapture } from "../core";
import type { Store } from "./store";

/** Open capture files made by the two bookmarks (DataRide team rankings, UCI race pages) into the cube. */
export async function importCaptureFiles(store: Store, files: File[]): Promise<string[]> {
  const lines: string[] = [];
  for (const f of files) {
    try {
      const r = addCapture(store.cube, JSON.parse(await f.text()) as CaptureFile);
      lines.push(
        f.name + ": " + r.added + " rankings added, " + r.replaced + " replaced" + (r.races ? ", " + r.races + " race results" : "") +
          (r.skipped.length ? ", skipped: " + r.skipped.join("; ") : ""),
      );
    } catch {
      lines.push(f.name + ": could not read this file");
    }
  }
  await store.saveCube();
  return lines;
}
