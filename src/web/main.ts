import profileYaml from "../../data/profiles/peloton.yaml";
import registryYaml from "../../data/peloton/races.yaml";
import fixturesYaml from "../../data/peloton/2026-fixtures.yaml";
import classesYaml from "../../data/classes.yaml";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import {
  fetchWikitext,
  lookupRace,
  parseStageTable,
  parseClasses,
  SeasonError,
  Thread,
  draftSeason,
  parseIcs,
  parseProfile,
  parseRegistry,
  parseSeason,
  renderSeason,
  seasonToYaml,
} from "../core";

const NL = String.fromCharCode(10);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; the page works without it */
  }
  return null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) e.className = String(cls);
  Object.assign(e, rest);
  e.append(...kids);
  return e;
}

function copy(text: string, btn: HTMLButtonElement): void {
  const done = () => {
    const old = btn.textContent;
    btn.classList.add("ok");
    btn.textContent = "Copied";
    setTimeout(() => {
      btn.classList.remove("ok");
      btn.textContent = old;
    }, 1200);
  };
  const fallback = () => {
    const ta = el("textarea", { value: text });
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      /* nothing else to try */
    }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

function download(name: string, text: string, type = "text/plain"): void {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

const profile = parseProfile(profileYaml);
const classes = parseClasses(classesYaml);
let threads: Thread[] = [];

function render(): void {
  const out = $("out");
  const msg = $("msg");
  out.replaceChildren();
  msg.textContent = "";
  msg.className = "";
  let registry;
  try {
    registry = parseRegistry($<HTMLTextAreaElement>("registry").value);
  } catch (e) {
    showError(e);
    return;
  }
  let season;
  try {
    season = parseSeason($<HTMLTextAreaElement>("season").value, registry);
  } catch (e) {
    showError(e);
    return;
  }
  threads = renderSeason(profile, registry, season, classes);
  store("rt-season", $<HTMLTextAreaElement>("season").value);
  store("rt-registry", $<HTMLTextAreaElement>("registry").value);
  const todo = threads.reduce((n, t) => n + t.warnings.length, 0);
  fillRaceChoices();
  msg.textContent = threads.length + " threads" + (todo ? ", " + todo + " things still to fill in" : "");
  threads.forEach((t, i) => out.append(card(t, i)));
}

function showError(e: unknown): void {
  const msg = $("msg");
  msg.className = "err";
  msg.textContent =
    e instanceof SeasonError ? "Fix these first:" + NL + e.errors.map((x) => "- " + x).join(NL) : String(e);
}

function card(t: Thread, i: number): HTMLElement {
  const key = "rt-done-" + t.id + "-" + t.firstDate;
  const c = el("div", { class: "card" });
  const cb = el("input", { type: "checkbox", checked: store(key) === "1" });
  c.classList.toggle("done", cb.checked);
  cb.onchange = () => {
    store(key, cb.checked ? "1" : "0");
    c.classList.toggle("done", cb.checked);
  };
  const b1 = el("button", { textContent: "Copy title" });
  b1.onclick = () => copy(t.title, b1);
  const b2 = el("button", { textContent: "Copy body" });
  b2.onclick = () => copy(t.body, b2);
  const head = el("div", { class: "row" }, cb, el("div", { class: "title", textContent: t.title }), b1, b2);
  const info = el("div", {
    class: "mut",
    textContent: t.kind + " | race date " + t.firstDate + (t.lastDate !== t.firstDate ? " to " + t.lastDate : "") + " | suggested post date " + t.suggestedPost,
  });
  c.append(head, info);
  if (t.warnings.length) {
    c.append(el("div", { class: "warn", textContent: "Still to fill in: " + t.warnings.join("; ") }));
  }
  c.append(
    el("details", {}, el("summary", { textContent: "Preview markdown" }), el("pre", { textContent: t.body })),
  );
  void i;
  return c;
}

function importIcs(text: string): void {
  const year = Number($<HTMLInputElement>("year").value) || new Date().getFullYear();
  const classes = [...document.querySelectorAll<HTMLInputElement>("input[name=cls]:checked")].map((x) => x.value);
  let registry = {};
  try {
    registry = parseRegistry($<HTMLTextAreaElement>("registry").value);
  } catch {
    /* an invalid registry is reported by render() */
  }
  const events = parseIcs(text);
  const season = draftSeason(events, { year, registry, classes });
  $<HTMLTextAreaElement>("season").value = seasonToYaml(season);
  $("importmsg").textContent = events.length + " calendar entries read, " + season.races.length + " races drafted";
  render();
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function seasonObj(): Obj {
  return (yamlParse($<HTMLTextAreaElement>("season").value) as Obj) ?? {};
}

function registryObj(): Obj {
  return (yamlParse($<HTMLTextAreaElement>("registry").value) as Obj) ?? {};
}

function raceName(race: Obj, registry: Obj): string {
  return String(race.name ?? registry[race.race]?.name ?? race.race);
}

function fillRaceChoices(): void {
  const sel = $<HTMLSelectElement>("wprace");
  const keep = sel.value;
  sel.replaceChildren();
  try {
    const s = seasonObj();
    const r = registryObj();
    for (const race of (s.races ?? []) as Obj[]) {
      sel.append(el("option", { value: race.race, textContent: raceName(race, r) + " (" + race.race + ")" }));
    }
    if (keep) sel.value = keep;
  } catch {
    /* invalid YAML is reported by render() */
  }
}

function wpSay(text: string, err = false): void {
  const m = $("wpmsg");
  m.textContent = text;
  m.className = err ? "err" : "mut";
}

async function fillStages(): Promise<void> {
  const id = $<HTMLSelectElement>("wprace").value;
  const title = $<HTMLInputElement>("wptitle").value.trim();
  if (!id || !title) return wpSay("Pick a race and type the Wikipedia edition page.", true);
  try {
    const s = seasonObj();
    const year = Number(/\b(19|20)\d\d\b/.exec(title)?.[0] ?? s.season);
    wpSay("Fetching " + title + "...");
    const draft = parseStageTable(await fetchWikitext(title), year);
    if (!draft.stages.length) return wpSay("No stage table found on that page.", true);
    const race = (s.races as Obj[]).find((r) => r.race === id)!;
    const have = new Map(((race.stages ?? []) as Obj[]).map((x) => [x.n, x]));
    // What you already typed wins; Wikipedia only fills the gaps.
    race.stages = draft.stages.map((d) => ({ ...d, ...have.get(d.n) }));
    if (!race.restDays?.length && draft.restDays.length) race.restDays = draft.restDays;
    delete race.date;
    $<HTMLTextAreaElement>("season").value = yamlStringify(s, { lineWidth: 0 });
    wpSay(draft.stages.length + " stages and " + draft.restDays.length + " rest days from Wikipedia. Check them.");
    render();
  } catch (e) {
    wpSay(String(e instanceof Error ? e.message : e), true);
  }
}

async function lookupWebsite(): Promise<void> {
  const id = $<HTMLSelectElement>("wprace").value;
  const box = $("wpresults");
  box.replaceChildren();
  try {
    const s = seasonObj();
    const reg = registryObj();
    const race = (s.races as Obj[]).find((r) => r.race === id);
    if (!race) return wpSay("Pick a race first.", true);
    const name = raceName(race, reg);
    wpSay("Looking up " + name + "...");
    const found = await lookupRace(name);
    wpSay(found.length + " candidates for " + name + ". Pick the right one (men's and women's are separate entries).");
    for (const c of found) {
      const b = el("button", { textContent: "Use", title: "Copy website and Wikipedia link into the race registry" });
      b.onclick = () => {
        const r2 = registryObj();
        const entry = (r2[id] ??= { name, category: race.category ?? "ME" });
        if (c.officialSite) entry.officialSite = c.officialSite;
        if (c.wikipedia) entry.wikipedia = c.wikipedia;
        $<HTMLTextAreaElement>("registry").value = yamlStringify(r2, { lineWidth: 0 });
        wpSay("Saved to the registry for " + id + ".");
        render();
      };
      box.append(
        el("div", { class: "row" }, b, el("span", { textContent: c.label + ": " + c.description + " | " + (c.officialSite ?? "no website") + " | " + (c.wikipedia ?? "no Wikipedia page") })),
      );
    }
  } catch (e) {
    wpSay(String(e instanceof Error ? e.message : e), true);
  }
}

function initClassBoxes(): void {
  const box = $("clsboxes");
  for (const c of classes) {
    const cb = el("input", { type: "checkbox", name: "cls", value: c.code, checked: c.rank <= 2 }); // WorldTour/WWT, ProSeries and the championships
    box.append(el("label", { title: c.name }, cb, " " + c.code));
  }
}

function init(): void {
  initClassBoxes();
  $<HTMLTextAreaElement>("registry").value = store("rt-registry") ?? registryYaml;
  $<HTMLTextAreaElement>("season").value = store("rt-season") ?? fixturesYaml;
  $("render").onclick = render;
  $("wpstages").onclick = () => void fillStages();
  $("wplookup").onclick = () => void lookupWebsite();
  $("reset").onclick = () => {
    $<HTMLTextAreaElement>("registry").value = registryYaml;
    $<HTMLTextAreaElement>("season").value = fixturesYaml;
    render();
  };
  $<HTMLInputElement>("ics").onchange = (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) f.text().then(importIcs);
  };
  $("dl-md").onclick = () =>
    download(
      "threads.md",
      threads.map((t) => t.title + NL + NL + t.body).join(NL + "-----" + NL + NL),
      "text/markdown",
    );
  $("dl-yaml").onclick = () => download("season.yaml", $<HTMLTextAreaElement>("season").value, "text/yaml");
  render();
}

init();
