/*
 * Pelotonic: capture helper for UCI DataRide road results (runs as a bookmarklet in YOUR browser).
 *
 * Press it on one of three DataRide pages that you have opened yourself:
 *   1. the list of competitions  (dataride.uci.ch/iframe/Results/10/, pick the season and category with the page's own filters)
 *   2. one competition           (a link in that list: .../CompetitionResults/<id>)
 *   3. one event                 (a link on the competition page: .../EventResults/<id>?competitionId=...)
 * It copies what is on screen into a collection kept in your browser, and keeps only the rows that score points.
 * To save you the clicking it also clicks the page's own controls, one click at a time with a pause, as you would:
 *   - on the list, the "next page" button, until the last page
 *   - on a competition page, the triangle of each closed row (stages, final classification), then the next page
 *   - on an event page, the "next page" button while every row on the page scored points
 * It never leaves the page you pressed it on, never follows a link, and sends no requests of its own: the page loads
 * its data itself when clicked. The Stop button ends it at once. Then download the collection and open it in Pelotonic.
 *
 * Reading the pages is done by src/core/dataride.ts and the clicking by src/core/autopilot.ts, the code the tests cover;
 * the build bundles them here.
 */
import { expandAll, pageThrough, realEnv } from "../src/core/autopilot";
import { mergeEvents, pageKind, readCompetitionEvents, readCompetitionList, readEventResults } from "../src/core/dataride";

(function () {
  // The names below keep the tool's earlier name: collections already saved in your browser, and
  // files already downloaded, must keep working.
  var STORE = "racethreads-capture-uci";
  var FORMAT = "racethreads-capture/1";
  var stopped = false;

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

  var msgEl = null;
  var infoEl = null;
  function counts(c) {
    return "Collection: " + c.competitions.length + " competitions, " + c.competitionEvents.length + " event lists, " + c.eventResults.length + " event results";
  }

  // running = true shows a Stop button while the bookmark is clicking
  function overlay(msg, c, running) {
    var old = document.getElementById("pelotonic-overlay");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "pelotonic-overlay";
    box.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:99999;background:#fff;color:#111;border:2px solid #0b57d0;" +
      "border-radius:8px;padding:10px 12px;font:13px system-ui,sans-serif;max-width:400px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    msgEl = document.createElement("div");
    msgEl.textContent = msg;
    box.appendChild(msgEl);
    infoEl = document.createElement("div");
    infoEl.style.cssText = "margin-top:4px;color:#555";
    infoEl.textContent = counts(c);
    box.appendChild(infoEl);
    function btn(label, fn) {
      var b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "margin:6px 6px 0 0;padding:4px 8px;cursor:pointer";
      b.onclick = fn;
      box.appendChild(b);
    }
    if (running) {
      btn("Stop", function () {
        stopped = true;
        msgEl.textContent = "Stopping after the current click ...";
      });
    } else {
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
          overlay("Collection cleared.", load(), false);
        }
      });
      btn("Close", function () {
        box.remove();
      });
    }
    document.body.appendChild(box);
  }
  function progress(text, c) {
    if (msgEl) msgEl.textContent = text;
    if (infoEl && c) infoEl.textContent = counts(c);
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

  function addEventResult(c, ev) {
    var have = null;
    for (var i = 0; i < c.eventResults.length; i++) if (c.eventResults[i].eventId === ev.eventId) have = c.eventResults[i];
    if (!have) {
      c.eventResults.push(ev);
      return;
    }
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

  var stop = function () {
    return stopped;
  };

  async function run() {
    var c = load();
    var kind = pageKind(location.pathname);

    if (kind === "list") {
      var filter = categoryFilterText();
      overlay("Reading the list" + (filter ? " (" + filter + ")" : "") + " ...", c, true);
      var listed = 0;
      var pages = await pageThrough(document, realEnv, {
        maxPages: 80,
        pause: 1200,
        stop: stop,
        again: function () {
          return true;
        },
        progress: function (t) {
          progress(t + " " + listed + " competitions so far.", c);
        },
        read: function () {
          var list = readCompetitionList(document, filter);
          list.forEach(function (x) {
            c.competitions = c.competitions.filter(function (y) {
              return y.id !== x.id;
            });
            c.competitions.push(x);
          });
          listed += list.length;
          save(c);
          progress("Read a page of the list: " + listed + " competitions so far ...", c);
          return list.length;
        },
      });
      overlay(
        (stopped ? "Stopped. " : "Done. ") + "Read " + pages + " page" + (pages === 1 ? "" : "s") + " of the list, " + listed + " competitions" +
          (filter ? " (" + filter + ")" : " (no Category filter found: women's races are told by their names)") +
          ". NEXT: download the collection and open it in Pelotonic, or change the season or category and press again.",
        c,
        false,
      );
      return;
    }

    if (kind === "competition") {
      overlay("Opening the closed rows of this competition ...", c, true);
      var known = null;
      var opened = 0;
      await pageThrough(document, realEnv, {
        maxPages: 8,
        pause: 1200,
        stop: stop,
        again: function () {
          return true;
        },
        progress: function (t) {
          progress(t, c);
        },
        read: async function () {
          opened += await expandAll(document, realEnv, {
            stop: stop,
            progress: function (t) {
              progress(t, c);
            },
          });
          var ce = readCompetitionEvents(document, location.pathname);
          if (ce && ce.events.length) {
            for (var j = 0; j < c.competitionEvents.length; j++) if (c.competitionEvents[j].competitionId === ce.competitionId) known = c.competitionEvents[j];
            if (known) known.events = mergeEvents(known.events, ce.events);
            else {
              c.competitionEvents.push(ce);
              known = ce;
            }
            save(c);
          }
          return ce;
        },
      });
      if (!known) {
        overlay("No events found on this page. Wait for it to load, then press again.", c, false);
        return;
      }
      overlay(
        (stopped ? "Stopped. " : "Done. ") + "Opened " + opened + " row" + (opened === 1 ? "" : "s") + "; " + known.events.length + " events known for this competition. " +
          "NEXT: open the General Classification and the stage results (not the points or youth rankings) and press again on each.",
        c,
        false,
      );
      return;
    }

    if (kind === "event") {
      overlay("Reading the results ...", c, true);
      var last = null;
      var read = await pageThrough(document, realEnv, {
        maxPages: 4,
        pause: 1200,
        stop: stop,
        again: function (ev) {
          // the next page can hold more points only when every row on this page scored
          return !!ev && ev.rows.length === ev.totalRows;
        },
        progress: function (t) {
          progress(t, c);
        },
        read: function () {
          var ev = readEventResults(document, location.pathname, location.search);
          if (ev && ev.totalRows) {
            addEventResult(c, ev);
            save(c);
            last = ev;
            progress("Read " + ev.rows.length + " point-scoring rows of " + ev.totalRows + " ...", c);
          }
          return ev;
        },
      });
      if (!last) {
        overlay("No result table found, or it is empty so far. Wait for the results to load, then press again.", c, false);
        return;
      }
      var all = null;
      for (var k = 0; k < c.eventResults.length; k++) if (c.eventResults[k].eventId === last.eventId) all = c.eventResults[k];
      var complete = all && all.rows.length < all.totalRows;
      overlay(
        (stopped ? "Stopped. " : "") + "Captured " + (all ? all.rows.length : 0) + " point-scoring rows from " + read + " page" + (read === 1 ? "" : "s") + ". " +
          (complete
            ? "This event is complete. NEXT: go back to the competition page, open the next event and press again, or download the collection."
            : "The last page I read still had only scoring rows; press again to go on, or the points may end exactly there."),
        c,
        false,
      );
      return;
    }

    overlay("This is not a DataRide results page. Open the competition list (dataride.uci.ch/iframe/Results/10/), a competition or an event first.", c, false);
  }

  run().catch(function (e) {
    overlay("Stopped by an error: " + (e && e.message ? e.message : e) + ". What was read so far is kept.", load(), false);
  });
})();
