// Builds the site into dist/: four pages that share app.js (with SQLite inside) and app.css.
import { build, transformSync } from "esbuild";
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
let sha = "dev";
try {
  sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  /* not a git checkout (e.g. a source zip) */
}
const version = "v" + pkg.version + " (" + sha + ")";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// the app: one bundle, SQLite (WebAssembly inlined) included, so pages also open without a network
await build({
  entryPoints: ["src/web/app.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "RT",
  target: "es2020",
  platform: "browser",
  external: ["node:*"], // sql.js only touches these under Node
  loader: { ".yaml": "text" },
  outfile: "dist/app.js",
  logLevel: "warning",
});

// the capture helpers as bookmarklet links
const bookmarklet = (file) => "javascript:" + encodeURIComponent(transformSync(readFileSync(file, "utf8"), { minify: true, target: "es2015" }).code);
const links = {
  __BOOKMARKLET_HREF__: bookmarklet("tools/capture-dataride.js"),
  __BOOKMARKLET_RACE_HREF__: bookmarklet("tools/capture-uci-race.js"),
};

for (const f of readdirSync("src/site").filter((n) => n.endsWith(".html"))) {
  let html = readFileSync("src/site/" + f, "utf8").split("__VERSION__").join(version);
  for (const [k, v] of Object.entries(links)) html = html.split(k).join(v);
  writeFileSync("dist/" + f, html);
}
copyFileSync("src/site/app.css", "dist/app.css");

// to run the site from a folder: node serve.mjs (or start.cmd on Windows)
copyFileSync("tools/serve.mjs", "dist/serve.mjs");
writeFileSync("dist/start.cmd", "@echo off\r\nnode serve.mjs\r\n");
writeFileSync(
  "dist/README.txt",
  [
    "racethreads " + version,
    "",
    "Run:  node serve.mjs   (or double-click start.cmd). Then open http://localhost:8765 in your browser.",
    "The pages keep their data in a SQLite database in your browser; save a copy from the Data page.",
    "",
  ].join("\n"),
);

console.log("dist/ built " + version + ": " + readdirSync("dist").join(", "));
