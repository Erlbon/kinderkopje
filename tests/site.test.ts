import { readFileSync, readdirSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

describe("the site icon", () => {
  it("is a well-formed SVG with the wheel and the four jersey dots", () => {
    const doc = parseHTML(read("src/site/favicon.svg"), "image/svg+xml") as unknown as { document: Document };
    const svg = doc.document.documentElement;
    expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
    const fills = Array.from(svg.querySelectorAll("circle")).map((c) => c.getAttribute("fill"));
    for (const jersey of ["#ffd23f", "#1fa34a", "#ffffff", "#d6282c"]) expect(fills, jersey).toContain(jersey);
  });
  it("is linked from every page", () => {
    for (const f of readdirSync(new URL("../src/site", import.meta.url)).filter((n) => n.endsWith(".html"))) {
      expect(read("src/site/" + f), f).toContain('<link rel="icon" type="image/svg+xml" href="favicon.svg">');
    }
  });
});

describe("the site headline", () => {
  const brand = (inner: string) => '<header class="brand"><a href="index.html"><img src="favicon.svg" width="36" height="36" alt="">' + inner + "</a></header>";
  it("is the project name with the logo, as the title of the home page and a link back on every other page", () => {
    expect(read("src/site/index.html")).toContain(brand("<h1>Pelotonic - The R Peloton Database Project</h1>"));
    for (const f of ["teams", "races", "data"]) expect(read("src/site/" + f + ".html"), f).toContain(brand('<span class="name">Pelotonic - The R Peloton Database Project</span>'));
  });
});

describe("the colours", () => {
  it("use orange for buttons, the current tab and links, in both modes", () => {
    const css = read("src/site/app.css");
    for (const orange of ["#d9480f", "#ff8a4c", "#ff6a2b"]) expect(css, orange).toContain(orange);
    expect(css).not.toContain("#0b57d0");
    expect(css).not.toContain("#8ab4f8");
    expect(css).toContain("nav a.active{background:var(--acc);color:var(--on-acc)");
  });
});

describe("the intro page", () => {
  const pages = ["intro", "index", "teams", "races", "data"];
  it("is the first tab on every page", () => {
    for (const f of pages) expect(read("src/site/" + f + ".html"), f).toContain('<nav>' + (f === "intro" ? '<a class="active" href="intro.html">Intro</a>' : '<a href="intro.html">Intro</a>') + '<a');
  });
  it("states the intent, lists the three tasks, and has a sources box with named links", () => {
    const html = read("src/site/intro.html");
    expect(html).toContain("AI-assisted hub for collecting information from reddit/r/peloton, UCI.org and other sources");
    for (const task of ["Automatic Race Thread Generation", "Automatic Race Statistics", "Automatic Team Statistics"]) expect(html, task).toContain(task);
    expect(html).toContain("a small database of current cycling results +/- five years");
    expect(html).toContain("fully open source and can be downloaded by any user in a sql lite file");
    const doc = parseHTML(html).document as unknown as Document;
    const links = Array.from(doc.querySelectorAll("#sources + fieldset a"));
    expect(links.length).toBeGreaterThanOrEqual(8);
    for (const a of links) {
      expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^https:\/\//);
      expect((a.textContent ?? "").trim().length).toBeGreaterThan(2);
    }
    expect(doc.querySelector('a[href="#sources"]')).not.toBeNull();
  });
});
