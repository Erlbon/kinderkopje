/*
 * Pelotonic: capture helper for UCI race pages (runs as a bookmarklet in YOUR browser).
 *
 * Use it on https://www.uci.org/competition-details/<year>/ROA/<id>, after you have opened the
 * "Final Classification" section (and any stage sections you want). It copies the rows that are on
 * screen and score UCI points (rank, rider, team, age, nation, result, points) into a collection kept
 * in your browser. It sends no requests of its own. Then download the collection and open the file in
 * Pelotonic.
 */
(function () {
  var STORE = "racethreads-capture-uci";
  var FORMAT = "racethreads-capture/1";

  function text(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  }
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(STORE) || "null");
      if (v && v.format === FORMAT && Array.isArray(v.raceResults)) return v;
    } catch (e) {}
    return { format: FORMAT, source: "uci.org", raceResults: [] };
  }
  function save(c) {
    localStorage.setItem(STORE, JSON.stringify(c));
  }

  function overlay(msg, collection) {
    var old = document.getElementById("pelotonic-overlay");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "pelotonic-overlay";
    box.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:99999;background:#fff;color:#111;border:2px solid #0b57d0;" +
      "border-radius:8px;padding:10px 12px;font:13px system-ui,sans-serif;max-width:360px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    var p = document.createElement("div");
    p.textContent = msg;
    box.appendChild(p);
    var n = collection ? collection.raceResults.length : 0;
    var info = document.createElement("div");
    info.style.cssText = "margin-top:4px;color:#555";
    info.textContent = "Collection: " + n + " race" + (n === 1 ? "" : "s");
    box.appendChild(info);
    function btn(label, fn) {
      var b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "margin:6px 6px 0 0;padding:4px 8px;cursor:pointer";
      b.onclick = fn;
      box.appendChild(b);
    }
    btn("Download collection", function () {
      var blob = new Blob([JSON.stringify(load(), null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "uci-capture.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    btn("Clear collection", function () {
      if (confirm("Delete everything captured so far?")) {
        localStorage.removeItem(STORE);
        overlay("Collection cleared.", load());
      }
    });
    btn("Close", function () {
      box.remove();
    });
    document.body.appendChild(box);
  }

  var m = /\/competition-details\/(\d{4})\/ROA\/(\d+)/.exec(location.pathname);
  if (!m) {
    overlay("This is not a UCI race page (competition-details). Open a race page first.", load());
    return;
  }
  var year = Number(m[1]);
  var uciId = Number(m[2]);

  // race facts: the page embeds them as data; fall back to the title
  var race = { uciId: uciId, year: year, name: text(document.querySelector("h1")) || document.title.replace(/\s*\|\s*UCI\s*$/, "") };
  try {
    var mod = document.querySelector('[data-component="CompetitionDetailsModule"]');
    var d = mod ? JSON.parse(mod.getAttribute("data-props")).competitionDetails : null;
    if (d) {
      race.name = d.name || race.name;
      race.dates = d.dates || "";
      race.country = d.country || "";
      race.classText = d.competitionClass || "";
      race["class"] = (d.competitionClass || "").split(" - ")[0].trim();
    }
  } catch (e) {}
  // Once the page is running, the embedded data is gone: read the same facts from the visible text.
  if (!race["class"]) {
    var body = String(document.body.innerText || "").replace(/\s+/g, " ").trim();
    var cm = /Class\s+(\d\.[A-Za-z0-9]+)\s*-\s*([^-]+?)\s*-\s*([^W]+?)\s+(?:Website|Email|FINAL|Races|Final)/.exec(body);
    if (cm) {
      race["class"] = cm[1];
      race.classText = cm[1] + " - " + cm[2].trim() + " - " + cm[3].trim();
    } else {
      var cm2 = /Class\s+(\d\.[A-Za-z0-9]+)/.exec(body);
      if (cm2) race["class"] = cm2[1];
    }
    var dm = /(\d{1,2} [A-Z][a-z]{2}(?: - \d{1,2} [A-Z][a-z]{2})? \d{4})/.exec(body);
    if (dm) race.dates = dm[1];
  }

  // the open result tables
  var tables = document.querySelectorAll(".results-accordion .results-table");
  var classifications = [];
  var kept = 0;
  for (var t = 0; t < tables.length; t++) {
    var tbl = tables[t];
    var rows = tbl.querySelectorAll("table tbody tr");
    if (!rows.length) continue;
    var panel = tbl.closest(".panel");
    var label = text(panel && panel.querySelector(".panel__label"));
    var title = text(tbl.querySelector(".results-table__title"));
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var tds = tr.querySelectorAll("td");
      if (tds.length < 4) continue;
      var pts = parseFloat(text(tds[tds.length - 1]).replace(",", "."));
      if (!(pts > 0)) continue; // only the rows that score points
      var pos = parseInt(text(tr.querySelector(".results-table__row-position")), 10);
      out.push({
        rank: pos > 0 ? pos : null,
        rider: (text(tr.querySelector(".results-table__row-firstname")) + " " + text(tr.querySelector(".results-table__row-lastname"))).trim(),
        team: text(tr.querySelector(".results-table__row-team")),
        age: parseInt(text(tds[0]), 10) || null,
        nation: text(tds[1]),
        result: text(tds[2]),
        points: pts,
      });
    }
    classifications.push({ label: label, title: title, totalRows: rows.length, rows: out });
    kept += out.length;
  }

  if (!classifications.length) {
    overlay("No open results found. On the race page open Final Classification (the button) first, then press again.", load());
    return;
  }

  var c = load();
  var existing = null;
  for (var r = 0; r < c.raceResults.length; r++) if (c.raceResults[r].uciId === uciId) existing = c.raceResults[r];
  if (!existing) {
    existing = Object.assign({ classifications: [] }, race);
    c.raceResults.push(existing);
  } else {
    Object.assign(existing, race);
  }
  existing.capturedAt = new Date().toISOString();
  for (var k = 0; k < classifications.length; k++) {
    var cl = classifications[k];
    var replaced = false;
    for (var e2 = 0; e2 < existing.classifications.length; e2++) {
      if (existing.classifications[e2].label === cl.label && existing.classifications[e2].title === cl.title) {
        existing.classifications[e2] = cl;
        replaced = true;
      }
    }
    if (!replaced) existing.classifications.push(cl);
  }
  save(c);
  overlay(
    "Captured " + kept + " point-scoring rows from " + classifications.length + " classification" + (classifications.length === 1 ? "" : "s") +
      " of " + race.name + " (" + (race.year || "?") + ").",
    c,
  );
})();
