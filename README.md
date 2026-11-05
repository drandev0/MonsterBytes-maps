# Monster Bytes maps

The interactive maps for the Endless Ages Monster Bytes guide: every world of
the game seen from above, with where each monster spawns, the NPCs and what
they sell or ask for, teleporters, chests and gathering spots, and safe zones.
The guide's site reads this repository and updates on its own when a change is
merged.

The guide's entries (monsters, items, quests…) live in
[drandev0/MonsterBytes](https://github.com/drandev0/MonsterBytes).

## What's here

```
worlds.config.json   which worlds to build, their titles, group, and the guide's places in each
worlds/<slug>/
  world.json     the world's name, the game's world id, the guide's places in it, its size and layers
  markers.json   every marker, joined to the game's tables (below)
  tiles/<z>/<x>/<y>.webp   the map cut into 256-pixel tiles, zoom 0 (whole map) to full detail
  levels/<id>/   the world's other maps (a crypt, interiors, caves), each with its own
                 markers.json and tiles; world.json lists them under "levels"
tools/
  build-world.mjs   makes the world folders from an Aura Editor game data export
  check-worlds.mjs  the check that runs on every pull request
```

## Levels

Some worlds keep a second floor in the same file: 4 Falls' crypt, Boomtown's
buildings, the caves under IIA and IIA South. Each is drawn on a map of its own,
so it doesn't show through the land or hide under it. A marker is on exactly one
map of its world. Spawn points come from the copy of each world the game's AI
server runs, and spawners that can never spawn are left out.

## The markers

Every marker has a `layer`, a `name` and `px`, `py`: the point on the full-size
map in pixels, from the top-left corner. Then, by layer:

| Layer | What | Fields |
|---|---|---|
| `mobs` | a spawn point | `mobs`: each monster that can appear there, `{ "id", "name", "level" }` (`id` is the game's AI config number; `level` is null where the game's name gives none), `spawner`, `capacity`, `radiusPx` |
| `npcs` | an NPC | `npcId`, `template` (race or model), `roles`, `quests` (`title`, `race`, `needs`, `gives`, `cash`, `opens`), `stock` (what they sell: `name`, `price`), `says` |
| `portals` | a teleporter NPC | `npcId`, `routes`: each `{ "to": { "world", "slug", "level", "levelName", "px", "py" }, "title", "races", "needs" }` (`level` is set when it lands on one of the world's other maps) |
| `gather` | a chest or gathering spot | `holds`, `respawnMin`, `key` |
| `shops` | a shop counter (stand in it and talk to the shopkeeper) | `box`, `stock` |
| `safezones` | a safe or damage zone | `box`, `kind` |
| `entities`, `players`, `triggers`, `water` | placed things, the player start, music zones, water | `detail`, `box` |

Item names are the game's own, like `(AP) Aqualaz (N)(W) (Lv0)`; the site links
them to the guide's page (`[AP] Aqualaz`).

## Fixing something

The markers are made from the game's files, so a fix usually belongs in
`worlds.config.json` (a world's title, or which of the guide's places it holds)
or in the build. To fix one marker by hand, open `worlds/<slug>/markers.json` on
GitHub, click the pencil, change it and propose the change. The check makes sure
the file still reads correctly. A rebuild from a new export replaces hand edits,
so say what you changed in the pull request.

## Rebuilding from a new export

This needs Node.js 22 or newer, and an export from Aura Editor's
`Build\Export-GameData.ps1` (its `data/` tables and `maps/<World>/` images).

1. `npm install`
2. `npm run build-world -- <export folder>` for every world, or
   `npm run build-world -- <export folder> Boomtown 4Falls` for some.
   Add `--markers-only` to keep the tiles and redo only the markers (fast).
3. `npm run check`, then commit `worlds/` and open a pull request.

To add a world, give it an entry in `worlds.config.json` first: its world file,
the game's `worldId`, a `slug`, a `title`, a `group` and, if any, the guide's
`places` in it (the names the guide's monsters list under `locations`).

## Rights

Endless Ages and its world art belong to Digital Motion Entertainment. These
maps are exported from the game's own world files for the players' guide.
