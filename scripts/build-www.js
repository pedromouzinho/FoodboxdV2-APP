// Assembles the Capacitor web bundle into ./www by copying the static web
// source (the same files Firebase Hosting serves). No bundler/build step —
// this just stages the assets the native iOS shell ships with.
//
// Run via: npm run build:www   (or npm run sync / npm run ios)
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "www");

const INCLUDE = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "css",
  "js",
  "icons",
  "data"
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const item of INCLUDE) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) {
    console.warn("skip (missing):", item);
    continue;
  }
  fs.cpSync(src, path.join(out, item), { recursive: true });
}

console.log("www/ built with:", INCLUDE.filter((i) => fs.existsSync(path.join(out, i))).join(", "));
