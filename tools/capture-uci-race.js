/*
 * Pelotonic: capture helper for UCI DataRide road results (runs as a bookmarklet in YOUR browser).
 *
 * Press it on one of three DataRide pages that you have opened yourself:
 *   1. the list of competitions  (dataride.uci.ch/iframe/Results/10/, pick the season and category with the page's own filters)
 *   2. one competition           (a link in that list: .../CompetitionResults/<id>)
 *   3. one event                 (a link on the competition page: .../EventResults/<id>?competitionId=...)
 * It copies what is already on screen into a collection kept in your browser and sends no requests of its own.
 * On an event page it keeps only the rows that score points. The table shows 40 rows at a time: press it again
 * after paging to the next 40 and the rows are added. Then download the collection and open the file in Pelotonic.
 *
 * Reading the pages is done by src/core/dataride.ts, the same code the tests cover; the build bundles it here.
 */
import { mergeEvents, pageKind, readCompetitionEvents, readCompetitionList, readEventResults } from "../src/core/dataride";

(function () {
  // The names below keep the tool's earlier name: collections already saved in your browser, and
  // files already downloaded, must keep working.
  var STORE = "racethreads-capture-uci";
  var FORMAT = "racethreads-capture/1";

  function load() {
    var v = null;
    try {
      v = JSON.parse(localStorage.getItem(STORE) || "null");
    } catch (e) {}
    if (!v || v.format !== FORMAT) v = { format: FORMAT, source: "dataride.uci.ch" };
    v.competitions = v.competitions || [];
    v.competitionEvents = v.competitionEvents || [];
    v.eventResults = v.eventResults || [];
    return v;
  }
  function save(c) {
    localStorage.setItem(STORE, JSON.stringify(c));
  }

  function overlay(msg, c) {
    var old = document.getElementById("pelotonic-overlay");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "pelotonic-overlay";
    box.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:99999;background:#fff;color:#111;border:2px solid #0b57d0;" +
      "border-radius:8px;padding:10px 12px;font:13px system-ui,sans-serif;max-width:380px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    var p = document.createElement("div");
    p.textContent = msg;
    box.appendChild(p);
    var info = document.createElement("div");
    info.style.cssText = "margin-top:4px;color:#555";
    info.textContent =
      "Collection: " + c.competitions.length + " competitions, " + c.competitionEvents.length + " event lists, " + c.eventResults.length + " event results";
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

  // the text of the page's filters, to find "Men Elite" / "Women Elite" in the Category box
  function categoryFilterText() {
    var inputs = document.querySelectorAll(".k-dropdown .k-input, .k-dropdown-wrap .k-input, .k-input");
    for (var i = 0; i < inputs.length; i++) {
      var t = (inputs[i].textContent || "").replace(/\s+/g, " ").trim();
      if (/^(Men|Women)/i.test(t)) return t;
    }
    return "";
  }

  var c = load();
  var kind = pageKind(location.pathname);

  if (kind === "list") {
    var filter = categoryFilterText();
    var list = readCompetitionList(document, filter);
    if (!list.length) {
      overlay("No competitions found on this page. Wait for the list to load, then press again.", c);
      return;
    }
    list.forEach(function (x) {
      c.competitions = c.competitions.filter(function (y) {
        return y.id !== x.id;
      });
      c.competitions.push(x);
    });
    save(c);
    overlay(
      "Captured " + list.length + " competitions from this page" + (filter ? " (" + filter + ")" : " (no Category filter found: women's races are told by their names)") +
        ". NEXT: go to the next page of the list and press again. When the list is done, download the collection and open a race from the queue.",
      c,
    );
    return;
  }

  if (kind === "competition") {
    var ce = readCompetitionEvents(document, location.pathname);
    if (!ce || !ce.events.length) {
      overlay("No events found on this page yet. Wait for it to load, then press again.", c);
      return;
    }
    var prev = null;
    for (var j = 0; j < c.competitionEvents.length; j++) if (c.competitionEvents[j].competitionId === ce.competitionId) prev = c.competitionEvents[j];
    if (prev) prev.events = mergeEvents(prev.events, ce.events);
    else c.competitionEvents.push(ce);
    save(c);
    var total = (prev || ce).events.length;
    overlay("Read " + ce.events.length + " event link" + (ce.events.length === 1 ? "" : "s") + " on screen; " + total + " known for this competition. A stage race shows links only for the rows you have opened: open every stage and the Final Classification, then press again. NEXT: open the General Classification (and each stage) and press again on each.", c);
    return;
  }

  if (kind === "event") {
    var ev = readEventResults(document, location.pathname, location.search);
    if (!ev) {
      overlay("No result table found. Wait for the results to load, then press again.", c);
      return;
    }
    if (!ev.totalRows) {
      overlay("The table is empty so far. Wait for the results to load, then press again.", c);
      return;
    }
    var have = null;
    for (var i = 0; i < c.eventResults.length; i++) if (c.eventResults[i].eventId === ev.eventId) have = c.eventResults[i];
    if (!have) {
      c.eventResults.push(ev);
    } else {
      // another page of the same table: add its rows
      var seen = {};
      have.rows.forEach(function (r) {
        seen[r.rank + "|" + r.rider] = r;
      });
      ev.rows.forEach(function (r) {
        seen[r.rank + "|" + r.rider] = r;
      });
      have.rows = Object.keys(seen)
        .map(function (k) {
          return seen[k];
        })
        .sort(function (a, b) {
          return (a.rank || 1e9) - (b.rank || 1e9);
        });
      have.totalRows = Math.max(have.totalRows, ev.totalRows);
      if (ev.heading) have.heading = ev.heading;
      if (ev.date) have.date = ev.date;
    }
    save(c);
    var more = ev.rows.length === ev.totalRows;
    overlay(
      "Captured " + ev.rows.length + " point-scoring rows of " + ev.totalRows + " on screen. " +
        (more
          ? "NEXT: every row on this page scored, so go to the next page of the table and press again."
          : "This event is complete. NEXT: go back to the competition page, open the next event and press again, or download the collection."),
      c,
    );
    return;
  }

  overlay("This is not a DataRide results page. Open the competition list (dataride.uci.ch/iframe/Results/10/), a competition or an event first.", c);
})();
