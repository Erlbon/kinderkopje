import profileYaml from "../../data/profiles/peloton.yaml";
import registryYaml from "../../data/peloton/races.yaml";
import fixturesYaml from "../../data/peloton/2026-fixtures.yaml";
import {
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
  threads = renderSeason(profile, registry, season);
  store("rt-season", $<HTMLTextAreaElement>("season").value);
  store("rt-registry", $<HTMLTextAreaElement>("registry").value);
  const todo = threads.reduce((n, t) => n + t.warnings.length, 0);
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

function init(): void {
  $<HTMLTextAreaElement>("registry").value = store("rt-registry") ?? registryYaml;
  $<HTMLTextAreaElement>("season").value = store("rt-season") ?? fixturesYaml;
  $("render").onclick = render;
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
