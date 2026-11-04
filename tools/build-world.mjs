// Turns an Aura Editor game data export into world folders for the guide's map viewer.
//
//   npm run build-world -- <export folder> [World ...] [--markers-only]
//   npm run build-world -- ../GameDataExport                 every world in worlds.config.json
//   npm run build-world -- ../GameDataExport Boomtown 4Falls  just these
//
// The export folder is what `Export-GameData.ps1` writes: data/*.json (the game's tables) and
// maps/<World>/<World>.png, .map.json, .markers.json. worlds.config.json says which worlds to build,
// their titles and the guide's places in each.
//
// Writes worlds/<slug>/:
//   world.json     size, zoom levels, layers, the game's world id and the guide's places in it
//   markers.json   the markers, with image coordinates, joined to the game's tables
//   tiles/<z>/<x>/<y>.webp   the map cut into 256-pixel tiles (skipped with --markers-only)
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const markersOnly = args.includes("--markers-only");
const [src, ...only] = args.filter((a) => !a.startsWith("--"));
if (!src) {
  console.error("Usage: npm run build-world -- <export folder> [World ...] [--markers-only]");
  process.exit(1);
}

const TILE = 256;
const readJson = async (f) => JSON.parse((await readFile(f, "utf8")).replace(/^﻿/, ""));
const config = await readJson("worlds.config.json");

// ---------- the game's tables ----------
const table = async (file, key) => (await readJson(join(src, "data", `${file}.json`)))[key];
const monsters = new Map((await table("monsters", "monsters")).map((m) => [m.id, m]));
const npcs = new Map((await table("npcs", "npcs")).map((n) => [n.id, n]));
const shops = new Map((await table("shops", "shops")).map((s) => [s.id, s]));
const questsByNpc = new Map();
for (const q of await table("quests", "quests")) {
  if (!questsByNpc.has(q.npcId)) questsByNpc.set(q.npcId, []);
  questsByNpc.get(q.npcId).push(q);
}
const worldIds = new Map(Object.entries(config.worlds).map(([file, c]) => [c.worldId, { file, ...c }]));

/** A game name without the editor's marks: "Datro Fire Q **" → "Datro Fire Q". */
const clean = (s) => String(s ?? "").replace(/\s+\*+\s*$/, "").replace(/\s+/g, " ").trim();
/** "Quadoty (LV7)" → "Quadoty", "Slate (LV15 BOSS)" → "Slate". */
const baseName = (s) => clean(s).replace(/\s*\(LV[^)]*\)\s*/gi, " ").trim();
/** The game has no level field; the level is in the name: "(LV7)", or "(LV15 BOSS)". */
const levelOf = (mo) => mo?.levelFromName ?? (Number(/\(LV\s*(\d+)/i.exec(mo?.name ?? "")?.[1]) || null);
const r1 = (n) => Math.round(n * 10) / 10;
const RACES = { "-1": null, 8: "BL", 18: "AP", 39: "HM", 51: "HF" };
const raceOf = (id) => (id === undefined || id === null || id === -1 ? null : RACES[id] ?? `template ${id}`);
const items = (list) => (list ?? []).map((i) => ({ name: clean(i.itemName), ...(i.qty > 1 ? { qty: i.qty } : {}) }));
const CONTAINER = /\b(chest|crate)$|^canister$/i;
/** A chest's contents, each item once with a count; the chest itself left out. */
function contents(list) {
  const out = [];
  for (const i of list ?? []) {
    const name = clean(i.itemName);
    if (CONTAINER.test(name)) continue;
    const had = out.find((x) => x.name === name);
    if (had) had.qty = (had.qty ?? 1) + 1;
    else out.push({ name });
  }
  return out;
}

/** What a world's calibration makes of a game position. */
const toPixel = (map, p) => ({ px: (p.x - map.origin.x) / map.unitsPerPixel, py: (map.origin.z - p.z) / map.unitsPerPixel });
const inside = (map, px, py) => px >= 0 && py >= 0 && px <= map.width && py <= map.height;

const SAFE = { 1: "damage zone", 2: "safe zone", 3: "safe zone (respawn point)" };

function questsOf(npcId) {
  return (questsByNpc.get(npcId) ?? [])
    .sort((a, b) => a.questIndex - b.questIndex)
    .map((q) => {
      const o = { title: clean(q.title) || "(no title)" };
      const race = raceOf(q.raceRaw);
      if (race) o.race = race;
      if (q.requiredSkillLevel > 0 && q.requiredSkillName) o.skill = `${q.requiredSkillName} ${q.requiredSkillLevel}`;
      const needs = items(q.requiredItems);
      if (needs.length) o.needs = needs;
      const gives = items(q.rewards);
      if (gives.length) o.gives = gives;
      if (q.randomReward && gives.length > 1) o.oneOf = true;
      if (q.cashReward > 0) o.cash = q.cashReward;
      if (q.miscAction === "opens shop") o.opens = "shop";
      if (q.miscAction === "opens bank") o.opens = "bank";
      return o;
    })
    // The same trade often repeats for each race; one line each is enough.
    .filter((q, i, all) => all.findIndex((x) => JSON.stringify(x) === JSON.stringify(q)) === i);
}

function stockOf(shopId) {
  const s = shops.get(shopId);
  return s ? s.stock.map((i) => ({ name: clean(i.itemName), price: i.price, ...(raceOf(i.raceId) ? { race: raceOf(i.raceId) } : {}) })) : [];
}

// ---------- each world ----------
const maps = new Map(); // file → its .map.json, for teleport targets
for (const file of Object.keys(config.worlds)) {
  const base = file.replace(/\.EXG$/i, "");
  const f = join(src, "maps", base, `${base}.map.json`);
  if (existsSync(f)) maps.set(file, await readJson(f));
}

const todo = Object.entries(config.worlds).filter(([file, c]) =>
  !c.skip && (only.length === 0 || only.some((o) => o.toLowerCase() === file.replace(/\.EXG$/i, "").toLowerCase())));
if (only.length && todo.length !== only.length) console.warn("Not in worlds.config.json (or skipped):", only.join(", "));

for (const [file, c] of todo) {
  const base = file.replace(/\.EXG$/i, "");
  const dir = join(src, "maps", base);
  const map = maps.get(file);
  if (!map) { console.warn(`${file}: no map in ${dir}, skipped`); continue; }
  const exported = await readJson(join(dir, `${base}.markers.json`));
  const out = join("worlds", c.slug);

  // ---------- tiles ----------
  let { width, height } = map;
  let maxZoom = Math.ceil(Math.log2(Math.max(width, height) / TILE));
  let background = c.background;
  if (!markersOnly) {
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    sharp.cache(false);
    const png = join(dir, map.image ?? `${base}.png`);
    ({ width, height } = await sharp(png, { limitInputPixels: false }).metadata());
    maxZoom = Math.ceil(Math.log2(Math.max(width, height) / TILE));
    if (!background) {
      // The sea colour, from the top-left pixel: shown where there are no tiles.
      const corner = await sharp(png, { limitInputPixels: false }).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
      background = "#" + [...corner.subarray(0, 3)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let tiles = 0;
    for (let z = maxZoom; z >= 0; z--) {
      const scale = 2 ** (z - maxZoom);
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const { data, info } = await sharp(png, { limitInputPixels: false })
        .resize(w, h, { kernel: "lanczos3" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
    }
    console.log(`${c.slug}: ${tiles} tiles`);
  } else {
    if (!existsSync(join(out, "world.json"))) { console.warn(`${c.slug}: no tiles yet; build it without --markers-only first`); continue; }
    background ??= (await readJson(join(out, "world.json"))).background;
  }

  // ---------- markers ----------
  const markers = [];
  const portalNpcs = new Set(exported.markers.filter((m) => m.layer === "portals").map((m) => m.npcId));
  let dropped = 0;
  for (const m of exported.markers) {
    if (m.layer === "lights") continue; // not something players look for
    if (!inside(map, m.px, m.py)) { dropped++; continue; } // spawners the world file holds for other places
    const o = { layer: m.layer, name: clean(m.name), px: r1(m.px), py: r1(m.py) };
    if (m.radiusPx !== undefined) o.radiusPx = r1(m.radiusPx);
    if (m.box) o.box = m.box.map(r1);

    if (m.layer === "mobs") {
      if (/^(UNUSED|NOTUSED)$/i.test(m.spawnerName ?? "")) { dropped++; continue; }
      o.mobs = (m.monsterIds ?? []).map((id) => {
        const mo = monsters.get(id);
        return { id, name: baseName(mo?.name ?? `Monster ${id}`), level: levelOf(mo), ...(/\bBOSS\b/.test(mo?.name ?? "") ? { boss: true } : {}) };
      });
      if (!o.mobs.length) { dropped++; continue; }
      o.name = o.mobs.map((x) => x.name).join(", ");
      if (m.spawnerName) o.spawner = clean(m.spawnerName);
      if (m.capacity) o.capacity = m.capacity;
      if (m.detail) o.detail = m.detail;
    } else if (m.layer === "npcs") {
      if (portalNpcs.has(m.npcId)) continue; // shown as its teleporter
      const n = npcs.get(m.npcId);
      if (n?.itemTypeRaw === 0) {
        // Lootable chests and gathering spots: named by what they hold.
        o.layer = "gather";
        const holds = contents(n?.equipment);
        const container = (n?.equipment ?? []).map((i) => clean(i.itemName)).find((x) => CONTAINER.test(x));
        o.name = clean(n?.name) || (container ? container : holds.map((i) => i.name).join(", ")) ||
          clean(n?.generatorName).replace(/^\([^)]*\)\s*/, "") || "Chest";
        if (holds.length) o.holds = holds;
        if (n.respawnMs) o.respawnMin = Math.round(n.respawnMs / 60000);
        if (n.requiredKey) o.key = n.requiredKey;
      } else {
        o.name = clean(n?.name || m.name) || clean(n?.generatorName) || `NPC ${m.npcId}`;
        o.npcId = m.npcId;
        if (n?.templateName) o.template = n.templateName;
        if (m.roles?.length) o.roles = m.roles;
        const quests = questsOf(m.npcId);
        if (quests.length) o.quests = quests;
        const stock = (n?.shopIds ?? []).flatMap(stockOf);
        if (stock.length) o.stock = stock;
        if (n?.chat?.length) o.says = n.chat.slice(0, 3).map((s) => s.replace(/^<[^>]*>:\s*/, ""));
      }
    } else if (m.layer === "portals") {
      const n = npcs.get(m.npcId);
      o.name = clean(n?.name) || clean(m.name.split(" -> ")[0]);
      o.npcId = m.npcId;
      const own = (questsByNpc.get(m.npcId) ?? []).filter((q) => q.teleport);
      const target = worldIds.get(m.targetWorldId);
      const tmap = target && maps.get(target.file);
      const to = { world: target?.title ?? (m.targetWorldId === null ? "unknown" : `world ${m.targetWorldId}`) };
      if (target && !target.skip) to.slug = target.slug;
      if (tmap && m.targetPosition) {
        const p = toPixel(tmap, m.targetPosition);
        if (inside(tmap, p.px, p.py)) { to.px = r1(p.px); to.py = r1(p.py); }
      }
      const route = { to };
      const q = own.find((x) => `${x.npcId}.${x.questIndex}` === m.portalId) ?? own[0];
      if (q) {
        route.title = clean(q.title);
        const race = raceOf(q.raceRaw);
        route.races = race ? [race] : [];
        const needs = items(q.requiredItems);
        if (needs.length) route.needs = needs;
      }
      o.routes = [route];
    } else if (m.layer === "shops") {
      o.shopId = m.shopId;
      o.stock = stockOf(m.shopId);
    } else if (m.layer === "safezones") {
      o.kind = m.source === "EARevolution.SZN" ? "monsters don't attack here" : SAFE[m.actionRaw] ?? `zone action ${m.actionRaw}`;
    } else if (m.detail) {
      o.detail = m.detail;
    }
    markers.push(o);
  }

  // A teleporter with several destinations becomes one marker listing them; the same
  // destination offered once per race becomes one route.
  const merged = [];
  const sameSpot = (a, b) => Math.abs(a.px - b.px) < 1 && Math.abs(a.py - b.py) < 1;
  const where = (to) => `${to.slug ?? to.world}|${Math.round((to.px ?? 0) / 20)}|${Math.round((to.py ?? 0) / 20)}`;
  for (const o of markers) {
    const twin = o.layer === "portals" && merged.find((x) => x.layer === "portals" && x.npcId === o.npcId && sameSpot(x, o));
    if (!twin) { merged.push(o); continue; }
    for (const r of o.routes) {
      const same = twin.routes.find((x) => where(x.to) === where(r.to));
      if (!same) twin.routes.push(r);
      // An empty list is any race.
      else if (same.races?.length) same.races = r.races?.length ? [...new Set([...same.races, ...r.races])] : [];
    }
  }
  for (const o of merged) for (const r of o.routes ?? []) {
    if (!r.races?.length || r.races.length >= 4) delete r.races;
    else r.races.sort();
  }

  const LAYERS = [
    ["mobs", "Mob spawns", "#e53935", true],
    ["npcs", "NPCs", "#ec407a", true],
    ["portals", "Teleporters", "#26a69a", true],
    ["gather", "Gathering and chests", "#8bc34a", false],
    ["shops", "Shop counters", "#8d6e63", false],
    ["safezones", "Safe and damage zones", "#9ccc65", false],
    ["entities", "Placed entities", "#1e88e5", false],
    ["players", "Player start", "#ffffff", false],
    ["triggers", "Music and triggers", "#fdd835", false],
    ["water", "Water", "#00bcd4", false],
  ];
  const layers = LAYERS.map(([id, title, color, shown]) => ({ id, title, color, shown, count: merged.filter((m) => m.layer === id).length }))
    .filter((l) => l.count > 0);
  const unknown = [...new Set(merged.map((m) => m.layer))].filter((l) => !LAYERS.some(([id]) => id === l));
  if (unknown.length) console.warn(`${c.slug}: layers not shown: ${unknown.join(", ")}`);

  // Place names on the map, drafted from the named safe zones (towns, outposts, cave mouths).
  // worlds.config.json can rename them ("labels": { "rename": { "Moons Rift": "Moon Rifts" } }),
  // hide some ("hide": [...]) and add others ("add": [{ "name", "px", "py" }]).
  const lc = c.labels ?? {};
  const labelName = (s) => {
    const raw = s.replace(/^IIAN_/, "").replace(/_/g, " ").replace(/\s*\d+$/, "").trim();
    return lc.rename?.[s] ?? lc.rename?.[raw] ?? raw;
  };
  const labels = [];
  for (const m of merged.filter((x) => x.layer === "safezones")) {
    const name = labelName(m.name);
    if (!name || lc.hide?.includes(name) || lc.hide?.includes(m.name)) continue;
    // One label per name, and none on top of another.
    if (labels.some((l) => l.name === name || (Math.abs(l.px - m.px) < 60 && Math.abs(l.py - m.py) < 30))) continue;
    labels.push({ name, px: r1(m.px), py: r1(m.py) });
  }
  for (const l of lc.add ?? []) labels.push({ name: l.name, px: l.px, py: l.py });

  const world = {
    format: "MonsterBytes/world/2",
    slug: c.slug,
    title: c.title,
    places: c.places ?? [],
    group: c.group ?? "other",
    worldId: map.worldId ?? c.worldId,
    source: { world: map.world, tool: map.format, unitsPerPixel: map.unitsPerPixel, origin: map.origin },
    width,
    height,
    tileSize: TILE,
    maxZoom,
    background,
    layers,
  };
  if (c.note) world.note = c.note;
  if (labels.length) world.labels = labels;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "world.json"), JSON.stringify(world, null, 2) + "\n");
  await writeFile(join(out, "markers.json"), JSON.stringify({ format: "MonsterBytes/markers/2", markers: merged }, null, 1) + "\n");
  console.log(`${c.slug}: ${merged.length} markers (${layers.map((l) => `${l.id} ${l.count}`).join(", ")}), ${dropped} left out`);
}
