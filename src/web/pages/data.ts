import { querySql, SCHEMA_VERSION, schemaVersion } from "../../db";
import { $, download, el } from "../dom";
import type { Store } from "../store";

const EXAMPLES: [string, string][] = [
  [
    "Team points, latest ranking of each season",
    "SELECT season, code, name, rank, points FROM v_team_points WHERE date IN (SELECT MAX(date) FROM team_snapshot GROUP BY season) ORDER BY season DESC, points DESC LIMIT 40",
  ],
  [
    "Top riders by points in the captured races",
    "SELECT rider, team, SUM(points) AS points, COUNT(*) AS results FROM v_results GROUP BY rider, team ORDER BY points DESC LIMIT 40",
  ],
  [
    "Team points from race results (team names as on UCI pages)",
    "SELECT team, SUM(points) AS points, COUNT(DISTINCT uci_id) AS races FROM v_results GROUP BY team ORDER BY points DESC LIMIT 40",
  ],
  ["Races captured", "SELECT year, race, class, COUNT(*) AS point_rows, SUM(points) AS points FROM v_results GROUP BY uci_id ORDER BY year, race"],
  ["Teams that changed code (same UCI id)", "SELECT team_id, group_concat(DISTINCT code) AS codes, group_concat(DISTINCT name) AS names FROM v_team_points GROUP BY team_id HAVING COUNT(DISTINCT code) > 1"],
];

export function initData(store: Store): void {
  function info(): void {
    const count = (t: string) => Number(store.db.exec("SELECT COUNT(*) FROM " + t)[0]!.values[0]![0]);
    const rows = [
      ["Team rankings (dates)", count("team_snapshot")],
      ["Team ranking rows", count("team_rank")],
      ["Race results", count("race_result")],
      ["Result rows (points only)", count("result_row")],
      ["Races in the queue", count("queue_race")],
      ["Saved texts (season, registry, layout ...)", count("kv")],
    ];
    const box = $("dbinfo");
    box.replaceChildren();
    for (const [label, n] of rows) box.append(el("div", { textContent: label + ": " + n }));
    box.append(
      el("div", { textContent: "Schema version " + schemaVersion(store.db) + " (this tool: " + SCHEMA_VERSION + "). File size about " + Math.round(store.exportBytes().length / 1024) + " KB." }),
      el("div", {
        class: store.persistent ? "mut" : "warn",
        textContent: store.persistent
          ? "Kept in this browser (IndexedDB). Use Save database to keep a copy or pass it on."
          : "This browser does not allow saving: the data lasts for this visit only. Use Save database before you close the page.",
      }),
    );
  }

  $("dbexport").onclick = () => download("pelotonic.sqlite", store.exportBytes(), "application/vnd.sqlite3");
  $<HTMLInputElement>("dbimport").onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!confirm("Replace everything in this browser with the contents of " + f.name + "?")) return;
    try {
      await store.importBytes(new Uint8Array(await f.arrayBuffer()));
      $("dbmsg").textContent = "Opened " + f.name + ".";
      info();
    } catch (err) {
      $("dbmsg").textContent = "Could not open that file: " + (err instanceof Error ? err.message : String(err));
    }
  };
  $("dbreset").onclick = async () => {
    if (!confirm("Delete ALL data (rankings, race results, queue, season and registry texts) from this browser? Save a copy first if you may need it.")) return;
    await store.reset();
    $("dbmsg").textContent = "Everything was deleted.";
    info();
  };

  // the SQL box (read-only)
  const box = $<HTMLTextAreaElement>("sqlbox");
  const ex = $("sqlexamples");
  for (const [label, sql] of EXAMPLES) {
    const b = el("button", { textContent: label });
    b.onclick = () => {
      box.value = sql;
    };
    ex.append(b);
  }
  $("sqlrun").onclick = () => {
    const out = $("sqlout");
    out.replaceChildren();
    try {
      const r = querySql(store.db, box.value);
      if (!r.columns.length) {
        out.append(el("div", { class: "mut", textContent: "No rows." }));
        return;
      }
      const table = el("table", { class: "queue" });
      table.append(el("tr", {}, ...r.columns.map((c) => el("th", { textContent: c }))));
      for (const row of r.rows.slice(0, 500)) table.append(el("tr", {}, ...row.map((v) => el("td", { textContent: v === null ? "" : String(v) }))));
      out.append(table, el("div", { class: "mut", textContent: r.rows.length + " rows" + (r.rows.length > 500 ? " (first 500 shown)" : "") }));
    } catch (err) {
      out.append(el("div", { class: "err", textContent: err instanceof Error ? err.message : String(err) }));
    }
  };

  store.onChange(info);
  info();
}
