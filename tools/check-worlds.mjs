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
  const mf = join(dir, "markers.json").replaceAll("\\", "/");
  let w, m;
  try { w = JSON.parse(readFileSync(wf, "utf8")); } catch (e) { say(wf, `can't be read: ${e.message}`); continue; }
  try { m = JSON.parse(readFileSync(mf, "utf8")); } catch (e) { say(mf, `can't be read: ${e.message}`); continue; }

  if (w.slug !== slug) say(wf, `"slug" is "${w.slug}" but the folder is "${slug}"`);
  for (const k of ["title", "background"]) if (typeof w[k] !== "string" || !w[k]) say(wf, `"${k}" should be text`);
  if (!Array.isArray(w.places) || !w.places.every((p) => typeof p === "string")) say(wf, `"places" should be a list of the guide's place names`);
  for (const k of ["width", "height", "tileSize", "maxZoom"]) if (!isNum(w[k])) say(wf, `"${k}" should be a number`);
  if (!existsSync(join(dir, "tiles", "0", "0", "0.webp"))) say(wf, "tiles/0/0/0.webp is missing");
  if (!existsSync(join(dir, "tiles", String(w.maxZoom), "0", "0.webp"))) say(wf, `tiles for zoom ${w.maxZoom} are missing`);

  if (!Array.isArray(m.markers)) { say(mf, `"markers" should be a list`); continue; }
  m.markers.forEach((k, i) => {
    const where = `marker ${i + 1}${k?.name ? ` ("${k.name}")` : ""}`;
    if (!LAYERS.has(k.layer)) say(mf, `${where}: unknown layer "${k.layer}" (use ${[...LAYERS].join(", ")})`);
    if (typeof k.name !== "string") say(mf, `${where}: "name" should be text`);
    if (!isNum(k.px) || !isNum(k.py) || k.px < 0 || k.py < 0 || k.px > w.width || k.py > w.height) {
      say(mf, `${where}: px/py should be a point on the ${w.width} x ${w.height} map`);
    }
    if (k.layer === "mobs" && !(Array.isArray(k.mobs) && k.mobs.length > 0 && k.mobs.every((x) => typeof x.name === "string" && (x.level === null || isNum(x.level))))) {
      say(mf, `${where}: "mobs" should list { "id", "name", "level" } for each monster (level null if the game gives none)`);
    }
    if (k.layer === "portals" && !(Array.isArray(k.routes) && k.routes.length > 0 && k.routes.every((r) => typeof r.to?.world === "string"))) {
      say(mf, `${where}: "routes" should list where the teleporter goes, each with "to": { "world" }`);
    }
    if (k.layer === "portals") for (const r of k.routes ?? []) {
      if (r.to?.slug && !existsSync(join("worlds", r.to.slug, "world.json"))) say(mf, `${where}: goes to "${r.to.slug}", which has no map`);
    }
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`${worlds.length} world(s), all valid.`);
