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
