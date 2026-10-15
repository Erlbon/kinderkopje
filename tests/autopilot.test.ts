import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { expandAll, findClosedRows, findNext, pageThrough, tableSignature, waitFor } from "../src/core";

const env = { sleep: async () => undefined };

function page(html: string): Document {
  return parseHTML("<html><body>" + html + "</body></html>").document as unknown as Document;
}

describe("the next page control", () => {
  it("is found by its title and ignored when it is disabled", () => {
    const d = page('<a title="Go to the next page" class="k-pager-nav" id="n"></a><a title="Go to the last page" class="k-pager-nav"></a>');
    expect(findNext(d)?.id).toBe("n");
    const off = page('<a title="Go to the next page" class="k-pager-nav k-state-disabled"></a>');
    expect(findNext(off)).toBeNull();
    expect(findNext(page("<p>no pager</p>"))).toBeNull();
  });
  it("falls back to the third of four arrows", () => {
    const d = page('<a class="k-pager-nav"></a><a class="k-pager-nav"></a><a class="k-pager-nav" id="third"></a><a class="k-pager-nav"></a>');
    expect(findNext(d)?.id).toBe("third");
  });
});

describe("closed rows", () => {
  const grid = (open: boolean) =>
    `<table><tbody><tr class="k-master-row"><td class="k-hierarchy-cell"><a aria-expanded="${open}" id="t"></a></td><td>Stage 1</td></tr>${open ? '<tr class="k-detail-row"><td><a href="/iframe/EventResults/1?competitionId=2"></a></td></tr>' : ""}</tbody></table>`;
  it("tells a closed row from an open one", () => {
    expect(findClosedRows(page(grid(false)))).toHaveLength(1);
    expect(findClosedRows(page(grid(true)))).toHaveLength(0);
  });
  it("opens every closed row, one click each, and stops when asked", async () => {
    const d = page(
      [1, 2, 3].map((n) => `<table><tbody><tr class="k-master-row" id="r${n}"><td class="k-hierarchy-cell"><a aria-expanded="false" id="t${n}"></a></td><td>Stage ${n}</td></tr></tbody></table>`).join(""),
    );
    // a click on a row's toggle opens it: a detail row with a link appears after the row
    for (const n of [1, 2, 3]) {
      d.getElementById("t" + n)!.addEventListener("click", () => {
        const tr = d.getElementById("r" + n)!;
        tr.insertAdjacentHTML("afterend", '<tr class="k-detail-row"><td><a href="/iframe/EventResults/' + n + '?competitionId=9">Stage Classification</a></td></tr>');
        d.getElementById("t" + n)!.setAttribute("aria-expanded", "true");
      });
    }
    expect(await expandAll(d, env)).toBe(3);
    expect(d.querySelectorAll("a[href*='/EventResults/']")).toHaveLength(3);
    expect(findClosedRows(d)).toHaveLength(0);
  });
  it("stops opening rows when asked", async () => {
    const d = page('<table><tbody><tr class="k-master-row"><td class="k-hierarchy-cell"><a aria-expanded="false"></a></td></tr></tbody></table>');
    expect(await expandAll(d, env, { stop: () => true })).toBe(0);
  });
});

describe("paging through a table", () => {
  function pagedTable(pages: string[][]): Document {
    const d = page('<table><tbody id="b"></tbody></table><a title="Go to the next page" id="next"></a>');
    let i = 0;
    const draw = () => (d.getElementById("b")!.innerHTML = pages[i]!.map((x) => "<tr><td>" + x + "</td></tr>").join(""));
    draw();
    d.getElementById("next")!.addEventListener("click", () => {
      if (i < pages.length - 1) {
        i++;
        draw();
        if (i === pages.length - 1) d.getElementById("next")!.classList.add("k-state-disabled");
      }
    });
    return d;
  }

  it("reads each page while the next one is worth reading", async () => {
    const d = pagedTable([["a", "b"], ["c", "d"], ["e", "f"]]);
    const seen: string[] = [];
    const n = await pageThrough(d, env, { read: () => seen.push(tableSignature(d)), again: () => true, maxPages: 10 });
    expect(n).toBe(3);
    expect(new Set(seen).size).toBe(3);
  });
  it("stops when the condition says the points have ended", async () => {
    const d = pagedTable([["a"], ["b"], ["c"]]);
    let reads = 0;
    const n = await pageThrough(d, env, { read: () => ++reads, again: (r) => r < 2, maxPages: 10 });
    expect(n).toBe(2);
  });
  it("never goes past the page limit, and stops when asked", async () => {
    const d = pagedTable([["a"], ["b"], ["c"], ["d"]]);
    expect(await pageThrough(d, env, { read: () => 0, again: () => true, maxPages: 2 })).toBe(2);
    let stopped = false;
    const d2 = pagedTable([["a"], ["b"], ["c"]]);
    expect(await pageThrough(d2, env, { read: () => (stopped = true), again: () => true, maxPages: 10, stop: () => stopped })).toBe(1);
  });
  it("gives up when the table does not change after the click", async () => {
    const d = page('<table><tbody><tr><td>same</td></tr></tbody></table><a title="next page"></a>');
    const quick = { sleep: async () => undefined };
    expect(await pageThrough(d, quick, { read: () => 0, again: () => true, maxPages: 5 })).toBe(1);
  });
  it("waitFor reports whether the condition came true", async () => {
    let n = 0;
    expect(await waitFor(() => ++n > 3, env, 5000)).toBe(true);
    expect(await waitFor(() => false, env, 400)).toBe(false);
  });
});
