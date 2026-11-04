// Turns an Aura Editor map export into a world folder for the guide's map viewer.
//
//   npm run build-world -- <export folder> <slug> "<guide place name>" ["<title>"]
//   npm run build-world -- ../exports/Boomtown boomtown Boomtown
//
// The export folder holds <World>.png, <World>.map.json and <World>.markers.json.
// Writes worlds/<slug>/:
//   world.json     size, zoom levels, layers, and the place in the guide it belongs to
//   markers.json   every marker, with image coordinates (mob names split into a list)
//   tiles/<z>/<x>/<y>.webp   the map cut into 256-pixel tiles, zoom 0 (whole map in one tile) up to full size
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const [src, slug, place, title = place] = process.argv.slice(2);
if (!src || !slug || !place) {
  console.error('Usage: npm run build-world -- <export folder> <slug> "<guide place name>" ["<title>"]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(`The slug "${slug}" should be lower-case letters, digits and dashes, like boomtown.`);
  process.exit(1);
}

const TILE = 256;
const readJson = async (f) => JSON.parse((await readFile(f, "utf8")).replace(/^﻿/, ""));

const files = await readdir(src);
const mapFile = files.find((f) => f.endsWith(".map.json"));
if (!mapFile) throw new Error(`No *.map.json in ${src}`);
const base = mapFile.slice(0, -".map.json".length);
const map = await readJson(join(src, mapFile));
const exported = await readJson(join(src, `${base}.markers.json`));

const out = join("worlds", slug);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// ---------- tiles ----------
sharp.cache(false);
const image = sharp(join(src, map.image ?? `${base}.png`), { limitInputPixels: false });
const { width, height } = await image.metadata();
const maxZoom = Math.ceil(Math.log2(Math.max(width, height) / TILE));

// The sea colour, from the top-left pixel: shown where there are no tiles.
const corner = await sharp(join(src, map.image ?? `${base}.png`), { limitInputPixels: false })
  .extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
const background = "#" + [...corner.subarray(0, 3)].map((b) => b.toString(16).padStart(2, "0")).join("");

let tiles = 0;
for (let z = maxZoom; z >= 0; z--) {
  const scale = 2 ** (z - maxZoom);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(join(src, map.image ?? `${base}.png`), { limitInputPixels: false })
    .resize(w, h, { kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let x = 0; x * TILE < w; x++) {
    await mkdir(join(out, "tiles", String(z), String(x)), { recursive: true });
    for (let y = 0; y * TILE < h; y++) {
      const tw = Math.min(TILE, w - x * TILE);
      const th = Math.min(TILE, h - y * TILE);
      await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .extract({ left: x * TILE, top: y * TILE, width: tw, height: th })
        // Edge tiles are padded with the sea so every tile is square.
        .extend({ right: TILE - tw, bottom: TILE - th, background })
        .webp({ quality: 82, effort: 5 })
        .toFile(join(out, "tiles", String(z), String(x), `${y}.webp`));
      tiles++;
    }
  }
  console.log(`zoom ${z}: ${w} x ${h}`);
}

// ---------- markers ----------
const r1 = (n) => Math.round(n * 10) / 10;
/** "Malia Bat (LV6), Kidion Bat (LV9)" → [{ name: "Malia Bat", level: 6 }, …] */
const mobsIn = (name) => [...name.matchAll(/(.+?) \(LV(\d+)\)(?:, |$)/g)].map((m) => ({ name: m[1].trim(), level: Number(m[2]) }));

const markers = exported.markers.map((m) => {
  const o = { layer: m.layer, name: m.name, px: r1(m.px), py: r1(m.py) };
  if (m.detail) o.detail = m.detail;
  if (m.radiusPx !== undefined) o.radiusPx = r1(m.radiusPx);
  if (m.box) o.box = m.box.map(r1);
  if (m.layer === "mobs") o.mobs = mobsIn(m.name);
  return o;
});

const world = {
  format: "MonsterBytes/world/1",
  slug,
  title,
  place,
  source: { world: map.world, tool: map.format, unitsPerPixel: map.unitsPerPixel, origin: map.origin },
  width,
  height,
  tileSize: TILE,
  maxZoom,
  background,
  layers: exported.layers.map((l) => ({ id: l.id, title: l.title, color: l.color, shown: l.shown, count: l.count })),
};
await writeFile(join(out, "world.json"), JSON.stringify(world, null, 2) + "\n");
await writeFile(join(out, "markers.json"), JSON.stringify({ format: "MonsterBytes/markers/1", markers }, null, 1) + "\n");
console.log(`${slug}: ${tiles} tiles, ${markers.length} markers, sea ${background} -> ${out}`);
