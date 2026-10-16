import { readFileSync } from "node:fs";

// the real answers of the Wikidata API for the five monuments (tests/fixtures/wikidata-monuments.json)
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/wikidata-monuments.json", import.meta.url), "utf8")) as {
  search: Record<string, { id: string; label?: string; description?: string }[]>;
  entities: Record<string, unknown>;
};

/** A fetch that answers like Wikidata would, from the saved responses; `asked` records every search term. */
export function fakeWikidata(asked: string[] = []): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.searchParams.get("action") === "wbsearchentities") {
      const term = u.searchParams.get("search") ?? "";
      asked.push(term);
      return new Response(JSON.stringify({ search: FIXTURE.search[term] ?? [] }));
    }
    const ids = (u.searchParams.get("ids") ?? "").split("|");
    return new Response(JSON.stringify({ entities: Object.fromEntries(ids.filter((i) => i in FIXTURE.entities).map((i) => [i, FIXTURE.entities[i]])) }));
  }) as typeof fetch;
}
