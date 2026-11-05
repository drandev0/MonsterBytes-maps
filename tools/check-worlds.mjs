// Checks every world folder: world.json, markers.json and the tiles they promise.
// Run with `npm run check`; GitHub runs it on every pull request.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const problems = [];
const say = (file, message) => {
  problems.push(`${file}: ${message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error file=${file}::${message}`);
};
const LAYERS = new Set(["mobs", "npcs", "portals", "gather", "shops", "safezones", "players", "entities", "triggers", "water", "lights"]);
const isNum = (n) => typeof n === "number" && Number.isFinite(n);

const worlds = existsSync("worlds") ? readdirSync("worlds", { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
for (const { name: slug } of worlds) {
  const dir = join("worlds", slug);
  const wf = join(dir, "world.json").replaceAll("\\", "/");
  let w;
  try { w = JSON.parse(readFileSync(wf, "utf8")); } catch (e) { say(wf, `can't be read: ${e.message}`); continue; }

  if (w.slug !== slug) say(wf, `"slug" is "${w.slug}" but the folder is "${slug}"`);
  for (const k of ["title", "background"]) if (typeof w[k] !== "string" || !w[k]) say(wf, `"${k}" should be text`);
  if (!Array.isArray(w.places) || !w.places.every((p) => typeof p === "string")) say(wf, `"places" should be a list of the guide's place names`);
  for (const k of ["width", "height", "tileSize", "maxZoom"]) if (!isNum(w[k])) say(wf, `"${k}" should be a number`);
  if (w.levels !== undefined && !Array.isArray(w.levels)) say(wf, `"levels" should be a list`);
  // The main map, then each level in levels/<id>/ with its own tiles and markers.
  const all = [{ ...w, dir, label: wf }];
  for (const l of Array.isArray(w.levels) ? w.levels : []) {
    if (typeof l.id !== "string" || !/^[a-z0-9-]+$/.test(l.id)) { say(wf, `level "${l.id}": "id" should be lower-case letters and digits`); continue; }
    if (typeof l.name !== "string" || !l.name) say(wf, `level "${l.id}": "name" should be text`);
    for (const k of ["width", "height", "maxZoom"]) if (!isNum(l[k])) say(wf, `level "${l.id}": "${k}" should be a number`);
    all.push({ ...l, dir: join(dir, "levels", l.id), label: `${wf} level "${l.id}"` });
  }
  for (const map of all) {
    if (!existsSync(join(map.dir, "tiles", "0", "0", "0.webp"))) say(map.label, "tiles/0/0/0.webp is missing");
    if (!existsSync(join(map.dir, "tiles", String(map.maxZoom), "0", "0.webp"))) say(map.label, `tiles for zoom ${map.maxZoom} are missing`);
    const mf = join(map.dir, "markers.json").replaceAll("\\", "/");
    let m;
    try { m = JSON.parse(readFileSync(mf, "utf8")); } catch (e) { say(mf, `can't be read: ${e.message}`); continue; }
    if (!Array.isArray(m.markers)) { say(mf, `"markers" should be a list`); continue; }
    m.markers.forEach((k, i) => {
      const where = `marker ${i + 1}${k?.name ? ` ("${k.name}")` : ""}`;
      if (!LAYERS.has(k.layer)) say(mf, `${where}: unknown layer "${k.layer}" (use ${[...LAYERS].join(", ")})`);
      if (typeof k.name !== "string") say(mf, `${where}: "name" should be text`);
      if (!isNum(k.px) || !isNum(k.py) || k.px < 0 || k.py < 0 || k.px > map.width || k.py > map.height) {
        say(mf, `${where}: px/py should be a point on the ${map.width} x ${map.height} map`);
      }
      if (k.layer === "mobs" && !(Array.isArray(k.mobs) && k.mobs.length > 0 && k.mobs.every((x) => typeof x.name === "string" && (x.level === null || isNum(x.level))))) {
        say(mf, `${where}: "mobs" should list { "id", "name", "level" } for each monster (level null if the game gives none)`);
      }
      if (k.layer === "portals" && !(Array.isArray(k.routes) && k.routes.length > 0 && k.routes.every((r) => typeof r.to?.world === "string"))) {
        say(mf, `${where}: "routes" should list where the teleporter goes, each with "to": { "world" }`);
      }
      if (k.layer === "portals") for (const r of k.routes ?? []) {
        if (!r.to?.slug) continue;
        const tf = join("worlds", r.to.slug, "world.json");
        if (!existsSync(tf)) { say(mf, `${where}: goes to "${r.to.slug}", which has no map`); continue; }
        if (r.to.level && !JSON.parse(readFileSync(tf, "utf8")).levels?.some((l) => l.id === r.to.level)) say(mf, `${where}: goes to level "${r.to.level}" of "${r.to.slug}", which has no such level`);
      }
    });
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`${worlds.length} world(s), all valid.`);
