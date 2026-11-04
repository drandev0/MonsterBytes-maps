// Copies the game's tables from an Aura Editor game data export into data/, for the guide's
// "In the game files" panels and for anyone who wants the numbers.
//
//   npm run build-data -- <export folder>
//
// Each table keeps the export's own format (see data/README.md), minus the `raw` copies of every
// database column. One row per line, so a new export shows as a readable diff.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [src] = process.argv.slice(2);
if (!src) {
  console.error("Usage: npm run build-data -- <export folder>");
  process.exit(1);
}

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (k !== "raw") o[k] = strip(x);
    return o;
  }
  return v;
};

await mkdir("data", { recursive: true });
let total = 0;
for (const file of (await readdir(join(src, "data"))).filter((f) => f.endsWith(".json")).sort()) {
  const j = strip(JSON.parse((await readFile(join(src, "data", file), "utf8")).replace(/^﻿/, "")));
  const rowsKey = Object.keys(j).find((k) => Array.isArray(j[k]) && k !== "sources" && j[k].length && typeof j[k][0] === "object");
  const head = Object.fromEntries(Object.entries(j).filter(([k]) => k !== rowsKey));
  const lines = (j[rowsKey] ?? []).map((r) => "  " + JSON.stringify(r));
  const text = `${JSON.stringify(head, null, 1).replace(/\n}$/, "")},\n "${rowsKey}": [\n${lines.join(",\n")}\n ]\n}\n`;
  JSON.parse(text); // it must still read
  await writeFile(join("data", file), text);
  total += text.length;
  console.log(`${file}: ${lines.length} ${rowsKey}, ${(text.length / 1e6).toFixed(1)} MB`);
}
console.log(`data/: ${(total / 1e6).toFixed(1)} MB`);
