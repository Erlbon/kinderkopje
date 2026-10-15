// Bundles the web app into ONE self-contained dist/index.html (no network, works offline).
import { build, transformSync } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
let sha = "dev";
try {
  sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  /* not a git checkout (e.g. a source zip) */
}

const result = await build({
  entryPoints: ["src/web/main.ts"],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  loader: { ".yaml": "text" },
});

// The capture helper for UCI DataRide pages, as a bookmarklet link (javascript: URL, percent-encoded).
const capture = transformSync(readFileSync("tools/capture-dataride.js", "utf8"), { minify: true, target: "es2015" }).code;
const bookmarklet = "javascript:" + encodeURIComponent(capture);

// Make the inlined script safe inside <script>.
const js = result.outputFiles[0].text.split("</script").join("<" + String.fromCharCode(92) + "/script");
const html = readFileSync("src/web/index.html", "utf8")
  .replace("__VERSION__", "v" + pkg.version + " (" + sha + ")")
  .replace("__BOOKMARKLET_HREF__", () => bookmarklet)
  .replace("__SCRIPT__", () => js);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
console.log("dist/index.html", Math.round(html.length / 1024) + " KB");
