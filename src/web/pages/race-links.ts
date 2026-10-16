import {
  CATEGORY_NAMES,
  LINK_LABELS,
  LinkKind,
  RaceLink,
  RaceRecord,
  WikidataRace,
  addToLinkStore,
  buildRaces,
  linkKey,
  linksFromCandidate,
  linksFromRegistry,
  lookupRace,
  normRaceName,
  parseLinkStore,
  pickCandidate,
  removeFromLinkStore,
} from "../../core";
import { $, el } from "../dom";
import type { Store } from "../store";

export interface FinderOptions {
  fetch?: typeof fetch; // for tests
  pause?: number; // ms between two requests to Wikidata
}

const WORLD_TOUR = /UWT|WWT/;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The names to ask Wikidata about, best first: the internal name, the names UCI used, and the part before a dash (a sponsor or a second name follows it). */
export function searchNames(race: RaceRecord): string[] {
  const plain = (name: string) =>
    name
      .split(" ")
      .filter((w) => !["la", "le", "il", "el", "los", "the", "ciclista", "cycliste", "ciclistico", "classic"].includes(w.toLowerCase()))
      .join(" "); // Wikidata calls "La Vuelta Ciclista a España" "Vuelta a España", and "Classic Brugge-De Panne" "Brugge-De Panne"
  const all = [race.name, ...race.names.map((n) => n.name), race.name.split(" - ")[0] ?? race.name, plain(race.name)];
  return [...new Set(all.map((n) => n.trim()).filter((n) => n.length >= 3))].slice(0, 5);
}

/** The races as the database knows them, with the links of the registry and the stored ones. */
export function currentRaces(store: Store): RaceRecord[] {
  const stores = [linksFromRegistry(store.getText("registry")), parseLinkStore(store.getText("racelinks"))];
  return buildRaces(store.cube, store.getText("racealiases") ?? "", store.getText("racenames") ?? "", undefined, stores);
}

/** The links of one race for its card under Race names: each as a link, the stored ones removable, and a row to add one. */
export function linksBlock(store: Store, race: RaceRecord, changed: () => void): HTMLElement {
  const box = el("div", { class: "mut" });
  box.style.marginTop = "6px";
  const keys = [race.name, ...race.names.map((n) => n.name)].map((n) => linkKey(n, race.category));
  const line = el("div");
  line.append(el("b", { textContent: "Links: " }));
  if (!race.links.length) line.append("none yet. ");
  race.links.forEach((l, i) => {
    if (i) line.append(", ");
    line.append(el("a", { href: l.url, target: "_blank", rel: "noopener", textContent: l.label ?? LINK_LABELS[l.kind], title: l.url + " (" + l.source + ")" }));
    if (l.source !== "registry") {
      const remove = el("button", { class: "twist", textContent: "x", title: "Remove this link", type: "button" });
      remove.onclick = async () => {
        await store.setText("racelinks", JSON.stringify(removeFromLinkStore(parseLinkStore(store.getText("racelinks")), keys, l)));
        changed();
      };
      line.append(remove);
    }
  });
  box.append(line);
  // add one by hand
  const kind = el("select");
  for (const k of ["website", "wikipedia", "x", "instagram", "facebook", "youtube", "tiktok", "firstcycling", "other"] as LinkKind[]) kind.append(el("option", { value: k, textContent: LINK_LABELS[k] }));
  const url = el("input", { type: "text", placeholder: "https://...", spellcheck: false });
  url.style.width = "300px";
  const add = el("button", { textContent: "Add link", type: "button" });
  add.onclick = async () => {
    const address = url.value.trim();
    if (!address.startsWith("https://") && !address.startsWith("http://")) {
      url.placeholder = "start with https://";
      url.value = "";
      return;
    }
    const options = Array.from(kind.options);
    const k = ((typeof kind.value === "string" && kind.value) || (options.find((o) => o.selected || o.hasAttribute("selected")) ?? options[0])?.value || "website") as LinkKind;
    const link: RaceLink = { kind: k, url: address, source: "manual" };
    await store.setText("racelinks", JSON.stringify(addToLinkStore(parseLinkStore(store.getText("racelinks")), keys[0]!, [link])));
    changed();
  };
  const row = el("div", { class: "row" }, kind, url, add);
  row.style.marginTop = "4px";
  box.append(row);
  return box;
}

type Decision = "same" | "diff" | "unknown";

interface Found {
  race: RaceRecord;
  candidate?: WikidataRace;
  confident: boolean;
  error?: string;
}

/**
 * Find links: asks Wikidata about the World Tour races of the chosen category, one race at a time with a pause, then shows
 * every match for a decision. Nothing is saved from a match until you have called it the same race.
 */
export function initLinkFinder(store: Store, opts: FinderOptions, ctx: { category: () => string; changed: () => void }): void {
  const pause = opts.pause ?? 1200;
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let stopped = false;

  $("linkstop").onclick = () => {
    stopped = true;
  };

  $("linkfind").onclick = async () => {
    const msg = $("linkmsg");
    const review = $("linkreview");
    review.replaceChildren();
    const cat = ctx.category();
    const terms = $<HTMLInputElement>("linkonly").value.split(",").map((t) => normRaceName(t)).filter((t) => t.length >= 2);
    const scope = currentRaces(store).filter(
      (r) =>
        WORLD_TOUR.test(r.class ?? "") &&
        (cat === "all" || r.category === cat) &&
        (!terms.length || terms.some((t) => normRaceName(r.name).includes(t) || r.names.some((n) => normRaceName(n.name).includes(t)))),
    );
    if (!scope.length) {
      msg.textContent = "No World Tour races" + (terms.length ? " with those names" : "") + " in this category.";
      return;
    }
    const rejected = JSON.parse(store.getText("linkrejected") ?? "{}") as Record<string, string[]>;
    stopped = false;
    $("linkfind").setAttribute("disabled", "disabled");
    $("linkstop").style.display = "";
    const found: Found[] = [];
    let failed = "";
    for (let i = 0; i < scope.length && !stopped; i++) {
      const race = scope[i]!;
      msg.textContent = "Asking Wikidata " + (i + 1) + " of " + scope.length + ": " + race.name + " ...";
      try {
        // ask under each of the race's names until one gives a clear match; keep the best match found
        const exclude = rejected[linkKey(race.name, race.category)] ?? [];
        let best = { score: -99, confident: false } as ReturnType<typeof pickCandidate>;
        const names = searchNames(race);
        for (let n = 0; n < names.length && !best.confident && !stopped; n++) {
          if (n > 0 && pause > 0) await sleep(pause);
          const pick = pickCandidate(await lookupRace(names[n]!, doFetch), race, exclude);
          if (pick.candidate && pick.score > best.score) best = pick;
        }
        found.push({ race, ...(best.candidate ? { candidate: best.candidate } : {}), confident: best.confident });
      } catch (e) {
        failed = e instanceof Error ? e.message : String(e);
        break; // Wikidata did not answer: stop here, show what there is
      }
      if (i < scope.length - 1 && pause > 0) await sleep(pause);
    }
    $("linkfind").removeAttribute("disabled");
    $("linkstop").style.display = "none";
    msg.textContent = (failed ? "Stopped: Wikidata did not answer (" + failed + "). " : stopped ? "Stopped. " : "") + found.length + " of " + scope.length + " races looked up. Decide each match below; nothing is saved until you press Save.";
    showReview(found);
  };

  function showReview(found: Found[]): void {
    const review = $("linkreview");
    review.replaceChildren();
    type Row = { f: Found; state: Decision; tr: HTMLElement; buttons: Record<Decision, HTMLButtonElement> };
    const rows: Row[] = [];
    const decide = (r: Row, state: Decision) => {
      r.state = state;
      r.tr.classList.toggle("rejected", state === "diff");
      for (const k of ["same", "diff", "unknown"] as const) {
        r.buttons[k].classList.toggle("on", k === state);
        r.buttons[k].setAttribute("aria-pressed", String(k === state));
      }
    };
    for (const cat of ["ME", "WE"] as const) {
      const list = found.filter((f) => f.race.category === cat);
      if (!list.length) continue;
      review.append(el("h3", { textContent: CATEGORY_NAMES[cat] + " races (" + list.length + ")" }));
      const table = el("table", { class: "queue" });
      table.append(el("tr", {}, el("th", { textContent: "Your decision" }), el("th", { textContent: "Race" }), el("th", { textContent: "Wikidata says" }), el("th", { textContent: "It would add" })));
      for (const f of list) {
        const mk = (label: string, cls: string) => el("button", { textContent: label, class: "seg-" + cls, type: "button" });
        const buttons = { same: mk("Same race", "same"), diff: mk("Not the same", "diff"), unknown: mk("Don't know", "unknown") };
        const c = f.candidate;
        const says = el("td");
        if (c) {
          says.append(el("a", { href: "https://www.wikidata.org/wiki/" + c.id, target: "_blank", rel: "noopener", textContent: c.label + " (" + c.id + ")" }), " " + (c.description || ""));
        } else {
          says.textContent = "No match on Wikidata: add the links by hand under Race names.";
        }
        const adds = c ? linksFromCandidate(c).map((l) => l.label ?? LINK_LABELS[l.kind]).join(", ") : "";
        const tr = el("tr", {}, el("td", { class: "seg" }, ...(c ? [buttons.same, buttons.diff, buttons.unknown] : [])), el("td", { textContent: (f.race.class ? f.race.class + " " : "") + f.race.name }), says, el("td", { textContent: adds }));
        const row: Row = { f, state: "unknown", tr, buttons };
        buttons.same.onclick = () => decide(row, "same");
        buttons.diff.onclick = () => decide(row, "diff");
        buttons.unknown.onclick = () => decide(row, "unknown");
        decide(row, "unknown");
        rows.push(row);
        table.append(tr);
      }
      review.append(table);
    }
    const confident = rows.filter((r) => r.f.confident && r.f.candidate);
    const accept = el("button", { textContent: "Mark the clear matches as the same race (" + confident.length + ")", type: "button" });
    accept.onclick = () => confident.forEach((r) => decide(r, "same"));
    const save = el("button", { textContent: "Save my decisions", type: "button" });
    save.onclick = async () => {
      let links = parseLinkStore(store.getText("racelinks"));
      const rejected = JSON.parse(store.getText("linkrejected") ?? "{}") as Record<string, string[]>;
      let yes = 0;
      let no = 0;
      for (const r of rows) {
        const key = linkKey(r.f.race.name, r.f.race.category);
        if (r.state === "same" && r.f.candidate) {
          links = addToLinkStore(links, key, linksFromCandidate(r.f.candidate));
          yes++;
        } else if (r.state === "diff" && r.f.candidate) {
          rejected[key] = [...(rejected[key] ?? []), r.f.candidate.id];
          no++;
        }
      }
      await store.setText("linkrejected", JSON.stringify(rejected));
      await store.setText("racelinks", JSON.stringify(links));
      review.replaceChildren();
      $("linkmsg").textContent = yes + " races got their links, " + no + " matches marked as not the same (not offered again), " + (rows.length - yes - no) + " left undecided.";
      ctx.changed();
    };
    const cancel = el("button", { textContent: "Cancel", type: "button" });
    cancel.onclick = () => review.replaceChildren();
    review.append(el("div", { class: "row" }, accept, save, cancel));
  }
}

