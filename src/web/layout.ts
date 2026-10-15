import { parse, stringify } from "yaml";
import { Column, ColumnField, Profile, RenderOptions, fmtDate } from "../core";
import type { Store } from "./store";

type Kind = "stage" | "oneday";
interface Item {
  col: Column;
  on: boolean;
}

const CUSTOM = "__custom";
const STORE = "layout";

const FIELDS: { field: ColumnField; header: string }[] = [
  { field: "date", header: "Date" },
  { field: "stage", header: "Stage" },
  { field: "route", header: "Route" },
  { field: "length", header: "Length" },
  { field: "type", header: "Type" },
  { field: "altitude", header: "Altitude" },
  { field: "finish", header: "Finish" },
  { field: "time", header: "Time" },
];

const SAMPLE_DATE = "2026-07-09";
const DATE_PRESETS = ["dd.mm", "dd/mm", "dd.mm.yyyy", "ddd. dd/mm", "ddd. dd.MMM", "dd MMM", "ddd dd MMM", "MMM dd"];
const LENGTH_PRESETS: { v: string; l: string }[] = [
  { v: "{n}km", l: "186km" },
  { v: "{n} km", l: "186 km" },
  { v: "{n}", l: "186" },
  { v: "{n,}", l: "186,2 (comma)" },
  { v: "{n,} km", l: "186,2 km" },
];
const TIME_PRESETS: { v: string; l: string }[] = [
  { v: "-", l: "12:25-17:46" },
  { v: " – ", l: "12:25 – 17:46" },
];
const ALIGNS: { v: string; l: string }[] = [
  { v: "", l: "default" },
  { v: "l", l: "left" },
  { v: "c", l: "center" },
  { v: "r", l: "right" },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function opt(value: string, label: string): HTMLOptionElement {
  return el("option", { value, textContent: label });
}

export interface LayoutControl {
  options(): RenderOptions;
}

export function initLayout(profile: Profile, onChange: () => void, store: Store): LayoutControl {
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  // The layout is kept in the shared database, so it travels with the .sqlite file.
  const readStore = (): { name?: string; custom?: { stage?: Column[]; oneday?: Column[] } } => {
    try {
      return JSON.parse(store.getText(STORE) ?? "{}");
    } catch {
      return {};
    }
  };
  const writeStore = (v: unknown): void => {
    void store.setText(STORE, JSON.stringify(v));
  };
  const variants = profile.tables.variants ?? {};
  let name = "";
  let kind: Kind = "stage";
  let items: Record<Kind, Item[]> = { stage: [], oneday: [] };
  let custom: { stage?: Column[]; oneday?: Column[] } | undefined;

  const base = (k: Kind, n: string): Column[] => (n && variants[n]?.[k]) || profile.tables[k];

  function toItems(cols: Column[], k: Kind): Item[] {
    const used = new Set(cols.map((c) => c.field));
    const rest = FIELDS.filter((f) => !used.has(f.field)).map((f) => ({
      col: { header: k === "oneday" && f.field === "route" ? "From > To" : f.header, field: f.field } as Column,
      on: false,
    }));
    return [...cols.map((c) => ({ col: { ...c }, on: true })), ...rest];
  }

  function load(n: string): void {
    name = n;
    if (n === CUSTOM && custom) {
      items = { stage: toItems(custom.stage ?? base("stage", ""), "stage"), oneday: toItems(custom.oneday ?? base("oneday", ""), "oneday") };
    } else {
      items = { stage: toItems(base("stage", n), "stage"), oneday: toItems(base("oneday", n), "oneday") };
    }
  }

  function enabled(): { stage: Column[]; oneday: Column[] } {
    const pick = (k: Kind) => items[k].filter((i) => i.on).map((i) => i.col);
    return { stage: pick("stage"), oneday: pick("oneday") };
  }

  /** Any edit makes this "my layout". */
  function commit(): void {
    custom = enabled();
    name = CUSTOM;
    writeStore({ name, custom });
    fillNames();
    onChange();
    draw();
  }

  function fillNames(): void {
    const sel = $<HTMLSelectElement>("layoutname");
    sel.replaceChildren(opt("", "Standard"));
    for (const [k, v] of Object.entries(variants)) sel.append(opt(k, v.label ?? k));
    if (custom) sel.append(opt(CUSTOM, "My layout"));
    sel.value = name;
  }

  function dateFormatSelect(it: Item): HTMLSelectElement {
    const cur = it.col.format ?? "dd.mm";
    const sel = el("select");
    const all = DATE_PRESETS.includes(cur) ? DATE_PRESETS : [cur, ...DATE_PRESETS];
    for (const f of all) sel.append(opt(f, fmtDate(SAMPLE_DATE, f)));
    sel.value = cur;
    sel.onchange = () => {
      it.col.format = sel.value;
      commit();
    };
    return sel;
  }

  function presetSelect(it: Item, presets: { v: string; l: string }[], fallback: string): HTMLSelectElement {
    const cur = it.col.format ?? fallback;
    const sel = el("select");
    const all = presets.some((p) => p.v === cur) ? presets : [{ v: cur, l: cur }, ...presets];
    for (const p of all) sel.append(opt(p.v, p.l));
    sel.value = cur;
    sel.onchange = () => {
      it.col.format = sel.value;
      commit();
    };
    return sel;
  }

  function move(from: number, to: number): void {
    const list = items[kind];
    if (to < 0 || to >= list.length || from === to) return;
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x!);
    commit();
  }

  function draw(): void {
    const ul = $("layoutlist");
    ul.replaceChildren();
    items[kind].forEach((it, i) => {
      const li = el("li");
      li.draggable = true;
      li.classList.toggle("off", !it.on);
      li.ondragstart = (e) => e.dataTransfer?.setData("text/plain", String(i));
      li.ondragover = (e) => {
        e.preventDefault();
        li.classList.add("over");
      };
      li.ondragleave = () => li.classList.remove("over");
      li.ondrop = (e) => {
        e.preventDefault();
        li.classList.remove("over");
        const from = Number(e.dataTransfer?.getData("text/plain"));
        if (!Number.isNaN(from)) move(from, i);
      };

      const cb = el("input", { type: "checkbox", checked: it.on, title: "Show this column" });
      cb.onchange = () => {
        it.on = cb.checked;
        commit();
      };
      const header = el("input", { type: "text", value: it.col.header, title: "Column header" });
      header.onchange = () => {
        it.col.header = header.value;
        commit();
      };
      const align = el("select", { title: "Alignment" });
      for (const a of ALIGNS) align.append(opt(a.v, a.l));
      align.value = it.col.align ?? "";
      align.onchange = () => {
        if (align.value) it.col.align = align.value as Column["align"];
        else delete it.col.align;
        commit();
      };
      const up = el("button", { textContent: "↑", title: "Move left" });
      up.onclick = () => move(i, i - 1);
      const down = el("button", { textContent: "↓", title: "Move right" });
      down.onclick = () => move(i, i + 1);

      li.append(el("span", { class: "handle", textContent: "⠿", title: "Drag to reorder" } as Partial<HTMLSpanElement>), cb, header, el("span", { className: "fld", textContent: it.col.field }), align);
      if (it.col.field === "date") li.append(dateFormatSelect(it));
      if (it.col.field === "length") li.append(presetSelect(it, LENGTH_PRESETS, "{n}km"));
      if (it.col.field === "time") li.append(presetSelect(it, TIME_PRESETS, " – "));
      li.append(up, down);
      ul.append(li);
    });
  }

  function drawDateControl(): void {
    const sel = $<HTMLSelectElement>("datefmt");
    sel.replaceChildren(opt("", "as in the layout"));
    for (const f of DATE_PRESETS) sel.append(opt(f, f + "  ->  " + fmtDate(SAMPLE_DATE, f)));
    sel.onchange = () => {
      if (!sel.value) return;
      for (const k of ["stage", "oneday"] as Kind[]) {
        for (const it of items[k]) if (it.col.field === "date") it.col.format = sel.value;
      }
      $("dateexample").textContent = "e.g. " + fmtDate(SAMPLE_DATE, sel.value);
      commit();
    };
  }

  // ---- wiring ----
  const saved = readStore();
  custom = saved.custom;
  load(saved.name === CUSTOM && custom ? CUSTOM : saved.name && variants[saved.name] ? saved.name : "");
  fillNames();
  drawDateControl();
  draw();

  $<HTMLSelectElement>("layoutname").onchange = (e) => {
    load((e.target as HTMLSelectElement).value);
    if (name !== CUSTOM) writeStore({ name, custom });
    draw();
    onChange();
  };
  $<HTMLSelectElement>("layoutkind").onchange = (e) => {
    kind = (e.target as HTMLSelectElement).value as Kind;
    draw();
  };
  $("layoutreset").onclick = () => {
    custom = undefined;
    writeStore({});
    load("");
    fillNames();
    draw();
    onChange();
  };
  $("layoutcopy").onclick = () => {
    const y = stringify(enabled(), { lineWidth: 0 });
    $<HTMLTextAreaElement>("layoutyaml").value = y;
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(y).catch(() => undefined);
  };
  $("layoutload").onclick = () => {
    try {
      const v = parse($<HTMLTextAreaElement>("layoutyaml").value) as Record<string, unknown>;
      const ok = (cols: unknown): cols is Column[] =>
        Array.isArray(cols) && cols.every((c) => c && typeof c.header === "string" && FIELDS.some((f) => f.field === c.field));
      if (!(ok(v.stage) || ok(v.oneday))) throw new Error("expected stage:/oneday: lists of {header, field}");
      custom = {
        stage: ok(v.stage) ? v.stage : base("stage", ""),
        oneday: ok(v.oneday) ? v.oneday : base("oneday", ""),
      };
      load(CUSTOM);
      commit();
    } catch (e) {
      $("layoutlist").textContent = "Could not read that layout: " + (e instanceof Error ? e.message : String(e));
    }
  };

  return {
    options(): RenderOptions {
      if (name === CUSTOM && custom) return { columns: custom };
      return name ? { table: name } : {};
    },
  };
}
