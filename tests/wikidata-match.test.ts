import { describe, expect, it } from "vitest";
import { WikidataRace, linksFromCandidate, lookupRace, pickCandidate } from "../src/core";
import { fakeWikidata } from "./helpers/wikidata";

const fakeFetch = fakeWikidata();

describe("matching a race with its Wikidata item", () => {
  const MONUMENTS: [string, string][] = [
    ["Milano-Sanremo", "Q33951"],
    ["Tour of Flanders", "Q33970"],
    ["Paris-Roubaix", "Q33992"],
    ["Liège-Bastogne-Liège", "Q34009"],
    ["Il Lombardia", "Q34032"],
  ];

  it("finds the men's race itself for each of the five monuments, not an edition, an under-23 race or the women's race", async () => {
    for (const [name, qid] of MONUMENTS) {
      const found = await lookupRace(name, fakeFetch);
      expect(found.length, name).toBeGreaterThan(0);
      const pick = pickCandidate(found, { name, category: "ME" });
      expect(pick.candidate?.id, name).toBe(qid);
      expect(pick.confident, name).toBe(true);
    }
  });
  it("finds the women's race where Wikidata has one, and nothing where it has none", async () => {
    const flanders = pickCandidate(await lookupRace("Tour of Flanders", fakeFetch), { name: "Tour of Flanders", category: "WE" });
    expect(flanders.candidate?.id).toBe("Q1637189"); // "women's cycling competition"
    const liege = pickCandidate(await lookupRace("Liège-Bastogne-Liège", fakeFetch), { name: "Liège-Bastogne-Liège", category: "WE" });
    expect(liege.candidate?.id).toBe("Q27538455"); // Femmes
    const roubaix = pickCandidate(await lookupRace("Paris-Roubaix", fakeFetch), { name: "Paris-Roubaix", category: "WE" });
    expect(roubaix.candidate).toBeUndefined(); // only the juniors' race is in the answer: no match rather than a wrong one
  });
  it("does not offer an item that was already rejected for the race", async () => {
    const found = await lookupRace("Milano-Sanremo", fakeFetch);
    const next = pickCandidate(found, { name: "Milano-Sanremo", category: "ME" }, ["Q33951"]);
    expect(next.candidate?.id).not.toBe("Q33951");
    expect(next.confident).toBe(false);
  });
  it("brings the official site, Wikipedia and the social media that Wikidata knows, and its own page", async () => {
    const flanders = pickCandidate(await lookupRace("Tour of Flanders", fakeFetch), { name: "Tour of Flanders", category: "ME" }).candidate!;
    const links = linksFromCandidate(flanders);
    expect(links.map((l) => l.kind)).toEqual(["website", "wikipedia", "instagram", "facebook", "x", "wikidata"]);
    expect(links.find((l) => l.kind === "instagram")!.url).toBe("https://www.instagram.com/rondevanvlaanderenofficial/");
    expect(links.find((l) => l.kind === "wikidata")!.url).toBe("https://www.wikidata.org/wiki/Q33970");
    expect(links.every((l) => l.source === "wikidata")).toBe(true);
    // Milano-Sanremo has only a website on Wikidata: that is what comes back, and nothing is made up
    const msr = linksFromCandidate(pickCandidate(await lookupRace("Milano-Sanremo", fakeFetch), { name: "Milano-Sanremo", category: "ME" }).candidate!);
    expect(msr.map((l) => l.kind)).toEqual(["website", "wikipedia", "wikidata"]);
  });
});

// wrong matches the first real run on 49 World Tour races produced, kept as cases
describe("wrong matches from the real run are not offered", () => {
  const item = (id: string, label: string, description: string, extra: Partial<WikidataRace> = {}): WikidataRace => ({ id, label, description, social: [], officialSite: "https://example.org", ...extra });
  const me = (name: string) => ({ name, category: "ME" as const });

  it("the women's race with an accent in its name is not the men's race (Féminine, Féminin)", () => {
    expect(pickCandidate([item("Q508838", "La Flèche Wallonne Féminine", "Belgian one-day road cycling race")], me("La Flèche Wallonne")).candidate).toBeUndefined();
    expect(pickCandidate([item("Q110765449", "Tour de Romandie Féminin", "Swiss multi-day road cycling race")], me("Tour de Romandie")).candidate).toBeUndefined();
    // and the other way round: a women's race gets the women's item
    expect(pickCandidate([item("Q508838", "La Flèche Wallonne Féminine", "Belgian one-day road cycling race")], { name: "La Flèche Wallonne", category: "WE" }).candidate?.id).toBe("Q508838");
  });
  it("an under-23 race in Dutch (Beloften) is not the race", () => {
    const found = [item("Q957537", "Ronde Van Vlaanderen Beloften", "cycling race"), item("Q33970", "Ronde van Vlaanderen", "Belgian one-day cycling race for men, one of the five monuments")];
    expect(pickCandidate(found, me("Ronde van Vlaanderen")).candidate?.id).toBe("Q33970");
    expect(pickCandidate([found[0]!], me("Ronde van Vlaanderen")).candidate).toBeUndefined();
  });
  it("a single stage of an edition is not the race", () => {
    expect(pickCandidate([item("Q23894538", "Critérium du Dauphiné 2011, étape 1", "")], me("Critérium du Dauphiné")).candidate).toBeUndefined();
    expect(pickCandidate([item("Q1", "Critérium du Dauphiné 2011", "cycling race")], me("Critérium du Dauphiné")).candidate).toBeUndefined();
  });
  it("an item with no description (an association, a club) is not trusted, however alike the name is", () => {
    expect(pickCandidate([item("Q124962699", "Volta Ciclista a Catalunya Associació Esportiva", "")], me("Volta Ciclista a Catalunya")).candidate).toBeUndefined();
  });
  it("a statue, a club or a team is not the race (a monument in a village is not Tour of Flanders)", () => {
    const statue = item("Q111494591", "Ronde van Vlaanderen monument", "pro cycling monument in Velzeke-Ruddershove, Belgium");
    expect(pickCandidate([statue], me("Ronde van Vlaanderen")).candidate).toBeUndefined();
    expect(pickCandidate([item("Q1", "UAE Team Emirates", "cycling team")], me("UAE Tour")).candidate).toBeUndefined();
    // but "one of the five monuments" still counts for a race
    expect(pickCandidate([item("Q33970", "Tour of Flanders", "Belgian one-day cycling race for men, one of the five monuments")], me("Tour of Flanders")).candidate?.id).toBe("Q33970");
  });
  it("a race whose edition year is part of its name is still matched", () => {
    expect(pickCandidate([item("Q9", "UEC Road European Championships 2026", "cycling championships")], me("UEC Road European Championships 2026")).candidate?.id).toBe("Q9");
  });
});
