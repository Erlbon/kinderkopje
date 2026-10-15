import { CaptureFile, RaceResult, parseSavedRacePage } from "../core";

export type Uploaded = { kind: "race"; race: RaceResult } | { kind: "capture"; file: CaptureFile };

/**
 * One uploaded file: a race page saved from uci.org ("Save page as, Webpage complete") or a capture file made by
 * one of the bookmarks. `contributor` is put on race results that do not already carry a name.
 * Throws a readable message when the file is neither.
 */
export async function readUploaded(file: File, contributor?: string): Promise<Uploaded> {
  const text = await file.text();
  const looksHtml = /\.html?$/i.test(file.name) || text.trimStart().startsWith("<");
  if (looksHtml) {
    const race = parseSavedRacePage(text, (h) => new DOMParser().parseFromString(h, "text/html"));
    if (contributor) race.contributor = contributor;
    return { kind: "race", race };
  }
  let parsed: CaptureFile;
  try {
    parsed = JSON.parse(text) as CaptureFile;
  } catch {
    throw new Error("not a saved race page and not a capture file");
  }
  if (contributor) for (const r of parsed.raceResults ?? []) if (!r.contributor) r.contributor = contributor;
  return { kind: "capture", file: parsed };
}
