# Monster Bytes maps

The interactive maps for the Endless Ages Monster Bytes guide: each world of
the game seen from above, with where every monster spawns. The guide's site
reads this repository and updates on its own when a change is merged.

The guide's entries (monsters, items, quests…) live in
[drandev0/MonsterBytes](https://github.com/drandev0/MonsterBytes).

## What's here

```
worlds/<slug>/
  world.json     the world's name, the place in the guide it belongs to, its size and layers
  markers.json   every marker: mob spawns, water, lights, triggers, placed entities
  tiles/<z>/<x>/<y>.webp   the map cut into 256-pixel tiles, zoom 0 (whole map) to full detail
tools/
  build-world.mjs   makes a world folder from an Aura Editor map export
  check-worlds.mjs  the check that runs on every pull request
```

## Fixing a marker

Open `worlds/<slug>/markers.json` on GitHub, click the pencil, and change the
marker. Each one looks like this:

```json
{
  "layer": "mobs",
  "name": "Flob (LV1), Clegurk (LV2)",
  "px": 3712.4,
  "py": 3301.9,
  "detail": "Spawner: Flob Field\nUp to 3 at once",
  "radiusPx": 12.9,
  "mobs": [ { "name": "Flob", "level": 1 }, { "name": "Clegurk", "level": 2 } ]
}
```

- `px`, `py`: the point on the full-size map in pixels, from the top-left corner.
- `mobs`: each monster that can appear there. Use the monster's exact name from
  the guide so it links to its page.
- `detail`: extra facts, one per line.
- `layer`: `mobs`, `players`, `entities`, `triggers`, `water` or `lights`.

Then propose the change. The check makes sure the file still reads correctly.

## Adding a world

This needs Aura Editor to export the world, and Node.js 22 or newer.

1. In Aura Editor: **Runtime → Export Map Image**, or
   `AuraEditor.exe --export-maps <folder> <World>.EXG --map-size 8192`.
2. Here: `npm install`, then
   `npm run build-world -- <export folder> <slug> "<place name in the guide>"`,
   for example `npm run build-world -- exports/Boomtown boomtown Boomtown`.
3. `npm run check`, then commit `worlds/<slug>/` and open a pull request.

The place name links the map to the guide's place page, so use the name the
guide's monsters list under `locations` (for example `Boomtown`).

## Rights

Endless Ages and its world art belong to Digital Motion Entertainment. These
maps are exported from the game's own world files for the players' guide.
