> The tables in this folder come from this export (made by Aura Editor's `Build\Export-GameData.ps1`), copied by `npm run build-data` without the `raw` database columns. The notes below are the export's own.

# Endless Ages game data export

The game's own tables, with the game's own ids, and a map of every world, for a players' guide (Monster Bytes).
Made by `Build\Export-GameData.ps1` from the game files in `Run\LocalBringUp\GameFiles` and the server database
`AuraGame` (SQL Server). The database is only read.

```
powershell -File Build\Export-GameData.ps1 [-Output <folder>] [-MapSize 8192] [-Worlds Boomtown.EXG,...] [-SkipMaps] [-SkipData] [-Force] [-Zip]
```

It runs three steps, which can also be run alone:

1. `AuraEditor.exe --export-data <folder>\data`: the game-file tables.
2. The script: the database tables, joined to step 1's by id.
3. `AuraEditor.exe --export-maps <folder>\maps <World.EXG> --map-size 8192 --data <folder>\data`: a map per world,
   one editor run per world so each starts with fresh memory. Worlds already mapped are skipped unless `-Force`;
   `-SkipData` makes only the maps, from the tables a previous run left.

## Layout

```
data/            the tables (below)
maps/<World>/    <World>.png, .map.json, .markers.json, one overlay PNG per layer, .html (an interactive viewer)
maps/export-maps.txt
README.md        this file
```

## Rules every file follows

- JSON, UTF-8 without a byte order mark.
- Each file has `format` (`AuraEditor/<table>/1`), `generated` (UTC), `sources` (the game files with their size and
  modification time, or the database tables), `count`, and its rows.
- Every row has the game's own `id`. A reference to another table carries that table's id and, for reading, its name
  (`itemId` and `itemName`).
- A code is given raw (`...Raw`, or the plain field) and decoded only where the engine code shows what it means. The
  file and line that show it are cited below. Everything not decoded is listed under Unknowns.
- Names are exactly as the files hold them.

## How the tables join

| From | Field | To |
|---|---|---|
| map marker (layer `mobs`) | `monsterIds` | `monsters.id` |
| map marker (`npcs`, `portals`, `shops`) | `npcId`, `portalId`, `shopId` | `npcs.id`, `portals.id`, `shops.id` |
| `monsters` | `entityTemplateId` | `entity-templates.id` |
| `monsters.drops`, `.equipment`, `recipes`, `quests`, `shops.stock`, `npcs.equipment` | `itemId` | `items.id` |
| `npcs`, `shops`, `safe-zones`, `portals` | `worldId`, `sourceWorldId`, `targetWorldId` | `worlds.id` |
| `npcs` | `templateId` | `entity-templates.id` |
| `npcs` | `questIds` | `quests.id` |
| `quests` | `npcId` | `npcs.id` |
| `quests.spawnsMonster` | `monsterId` | `monsters.id` |
| `npcs` (shop) | `shopIds` | `shops.id` |
| `items.races`, `quests.raceRaw`, `shops.stock.raceId` | template id | `entity-templates.id` (-1 = any) |
| map `.map.json`, `.markers.json` | `worldId` | `worlds.id` |

## World ids

A world's id is `SYSWORLDSTENCILS.STENCILCHANNEL` (the "stencil channel"). NPCs, shops, action zones and world rules
are all keyed by it (SharedNet.cpp:6527-6555, ServerMain.cpp:764 and 2703-2730, QuestSystems.cpp:215). A running zone
also has a live channel; for the persistent worlds it equals the stencil channel. `tblSupportedWorlds` is obsolete
(its loader is commented out, SystemsLoader.cpp:302) and its ids are not world ids.

## The tables

### worlds.json (database: SYSWORLDSTENCILS, SYSWORLDRULES, locations_spawnPoints)

`id` = `worldId` (stencil channel), `exgFile`, `aiWorldFile` (the AI server's copy), `instanceTypeRaw` (0 = a
normal zone), `maxConnections`, `fileFound` (the EXG is in GameFiles), `displayName` (only where
`locations_spawnPoints` names the world; there is no world name table), `rules` (`ruleId`, `ruleName`, `param`: e.g.
NODROP, SPAWN_INVUNERABLE in ms).

### monsters.json (EARevolution.AII, .EDB, .APX, .MIS)

One row per AI configuration, the game's monster type. `id` = `aiConfig` = its position in the .AII list, the number
spawn generators, map markers ("AI config: 680") and quests use.

- `name`: what players see: the configuration's name override, else its entity template's name
  (SpawnSystems.cpp:821-822). `configName` is the editor's label.
- `levelFromName`: the number in "(LVn)" in the name. **The game has no monster level field**; this is read from the
  name text only.
- `hp`: the configuration's `energyOverride` when above 0, else the template's `templateMaxEnergy`
  (SpawnSystems.cpp:776-818).
- `aggressiveRaw`, `aggressive`: 0 passive, 1 aggressive (picks its own targets), 2 attacks murderers only
  (AiManager.cpp:132-144, 1815-1817).
- `credits`: given at spawn as `min + rand() % (max - min)`, so `max` here is the raw maximum minus 1; none when the
  raw maximum is not above the minimum (SpawnSystems.cpp:824-832). Units: the lowest currency (Bronze, ratio 1, in
  `GM_CURRENCY`).
- `dropChancePercent`: one chance for the whole configuration, 0-100. Each entry of `drops` is rolled on its own
  against it (SpawnSystems.cpp:836-854). There is no per-item chance. Each drop is one unit.
- `equipment`: armed entries, always given.
- `attack`: the armed weapon (`weaponItemId`, slot 12) and what it can hit with (see items.json `attack`), plus the
  monster's own skeleton's fire cues and damage paths (`from: "entity template skeleton"`).
- `experienceValue`: what hitting it is worth in skill experience (DamageSystems.cpp:449-481). Not a level.
- `entityTemplateId`, `entityTemplateName`, `sightRadius`, `aggressiveRange` (compared with a squared distance).

### items.json (EARevolution.APX, .MIS, .ELD)

One row per item in file order; **an id can appear more than once** (the editor clones items per template).
`fileIndex` tells them apart.

- `id` (global id), `name`, `iconId` (`m_visualRef`: the id in the menu icon database, GlobalStatusVariables.cpp:
  2855-2903).
- `useType`, `useTypeName`: 0 none, 1 heal, 2 ammo, 3 use skill, 4 open menu, 5 combine, 6 house deed, 7 obsolete,
  8 summon AI, 9 powerup, 10 misc, 11 faction item, 12 skill ability (AttributeSystems.cpp:2139-2620).
  `miscUseValue` is the use's amount, menu, house type or AI config, by use type.
- `locationId`: the equipment slot; `locationName` "weapon" for 12.
- `requiredStr`, `requiredDex`, `requiredWis` (SharedNet.cpp:3544-3562).
- `requiredSkillType`, `requiredSkillLevel`, `requiredSkillName`, `levelRequirementEnforced`: enforced only when the
  type is above -1 and the level above 1 (SharedNet.cpp:3564-3648). This is the item's "level".
- `marketCost`, `buyPrice` (= cost), `sellPrice` (= cost / 4, rounded down) (AttributeSystems.cpp:889-895, 1028).
- `races`: who can wear it: each attachment's `raceBind` as a template id, -1 = any (ItemManager.cpp:602-623). The
  item's own `raceIdRaw` is stored but never checked.
- `resistances`: element index, name and value (CInventoryClass.cpp:1209-1254).
- `statBonuses`: `statId` and value; `statName` for 2 STR, 3 DEX, 4 WIS.
- `emblems`: Health +10, Health +20, Resist +1, Damage Taken -5, Ammo Regen +2 (CMenuScript.cpp:4893-4926).
- `stackable`: the game caps every stack at 30000; there is no per-item stack size.
- `attack` (weapons): the weapon visuals its attachments use, the missiles any of their fire cues name (first or third
  person) or an attachment overrides with, which is what the server accepts from the weapon
  (AIXVerifyWeaponProjectile, DamageSystems.cpp:541-597), and the melee damage paths. A missile's damage is
  `min + rand() % (max - min)`: `damageMax` is the reachable maximum and `damageMaxRaw` the stored one. Its element
  is the channel list's first entry, else its channel (-1 = 0) (DamageSystems.cpp:1014-1037). Melee `damageMin` and
  `damageMax` are raw.
- Also raw: `armourClass`, charges and ammo, `hp`/`maxHp` (0 = indestructible, 1 = broken), `keyId`, `nonDrop`,
  `nonTransferable`, `destroyOnUse`, `permanent`, `bonusType`, `bonusDuration`, `damageMultiplier`, `explosionRef`,
  `defensesSpecific`.

### skills.json, recipes.json, spells.json (EARevolution.SKL)

Crafting and magic are skill abilities: each skill has level ranges, each with abilities. Abilities have no id of
their own; `id` is `<skillType>.<level range>.<ability>` by position. Skill types: 1 Weapon Tech, 2 Smithy, 3 Hiding,
4 Shape Shifting, 5 Mind Control, 6 Melee, 7 Alchemy, 8 Engineering, 9 Pilot, 10 Familiars, 11 Reveal, 12 MagicOLD,
13 Magic, 14 Security Level (the names are the file's).

- `skills.json`: every skill, level range (`start`, `end`, `title`) and ability, with `functionType` and
  `functionName`: 0 none, 1 create item, 2 shapeshift, 3 hiding, 4 mount, 5 reveal, 6 radius damage or heal,
  7 emit projectile, 8 heal self (CSkillClass.h:59; AttributeSystems.cpp:2905-3001).
- `recipes.json`: every ability with result items. `products` and `materials` list each item once with `qty`, the
  number of entries: the server takes and gives one unit per entry (CSkillObject.cpp:496-637); `quantityRaw` is the
  sum of the entries' own quantities, which the server ignores. `levelRequired` is the ability's minimum skill level.
  `toolItem` and `componentItem` are items the crafter must hold (`miscInt2`, `miscInt3`). `requiredStats` are
  minimum statistics.
- `spells.json`: the abilities of the skill named "Magic". `reagents` are its required items, `circle` its level
  range's title, `magicLevelRequired` its minimum level.

### entity-templates.json (EARevolution.EDB)

`id` (unique id; equal to the position in the file), `name`, `energy`, `maxEnergy`, `monsterAiConfigs` (the monsters
that spawn as it), and raw `controlTypeRaw`, `aiConfigRaw`, `raceIdRaw`. Templates 8 Bloblic, 18 Amphibious,
39 Human Male and 51 Human Female are the playable races; 17 is "Portal Entity", 24 "Venderbot".

### shops.json (EARevolution.CDB)

Store zones: a shop NPC opens the zone that holds the player (QuestSystems.cpp:210-220). `id`, `name`, `worldId`,
`boxMin`/`boxMax`, `stock` (`itemId`, `itemName`, `price` = market cost, `sellBackPrice`, `raceId`: -1 any, else the
template a buyer must be, SharedNet.cpp:5266), `dealsWithCriminals`, `menuBind`.

### safe-zones.json (EARevolution.ACZ, EARevolution.SZN)

- `source: "EARevolution.ACZ"`: the server's action zones, by world: `actionRaw` and `action`: 1 damage (`value` per
  tick), 2 safe, 3 safe with rebirth (actionzones.h:22, ServerMain.cpp:764-813). These are the safe zones players
  get.
- `source: "EARevolution.SZN"`: the AI's safe zones, where monsters do not aggro (AiManager.cpp:288, 1791).
- All boxes (`boxMin`, `boxMax`).

### npcs.json (database: gm_IGNEntity, gm_IGNQuestData, gm_IGNInventory, gm_IGNChatStrings)

`id` (spawn id), `name` (display name), `generatorName` (editor name), `templateId`/`templateName`, `worldId`,
`worldFile`, `position`, `questIds`, `questCount`, `equipment`, `chat` (random lines), `requiredKey` (chests),
`respawnMs`, `interactRadius`, and `raw` (every column).

- `itemTypeRaw`, `itemType`: 0 lootable chest, 1 random speech, 2 sequenced speech, 3 quest or menu, 4 arena bookie,
  5 bounty (CServerItemClass.h:7-15).
- `roles`, from its quests: `shop` (a quest opens a shop), `bank`, `teleporter`, `gives skill experience`, `quest`
  (a quest takes or gives items).
- `shopIds`: for shop NPCs, the store zones (shops.json) whose box holds the NPC.

### quests.json (database: gm_IGNQuestData, gm_IGNInventory, GM_CURRENCY)

`id` = `<npcId>.<questIndex>`. An NPC's quests in `questIndex` order are its steps: with `progressesByJournal` the
journal entry picks the next step and success advances it (TextSystems.cpp:2855-2888).

- `title`, `description` (what the NPC says), `completionMessage`, `hint`.
- `requiredItems` and `rewards`: each item once with `qty` (one row is one unit). Required currency items carry
  `creditValue`. `randomReward`: one random reward instead of all.
- `raceRaw` (-1 any, else a template id) and `raceName`; `requiredSkillType`/`Level`/`Name` (checked when the level is
  above 0, QuestSystems.cpp:55-86).
- `cashReward`, `expBonus` with `skillTypeBonus` and `skillBonusName`, `maxExpLimit`.
- `miscActionRaw`, `miscAction`: 0 none, 1 opens shop, 2 opens bank (QuestSystems.cpp:208-224).
- `teleport`: where it sends the player (`worldFile`, `worldId`, `position`, `instanceTypeRaw`, `setsRespawnPoint`).
- `spawnsMonster`: a monster it spawns.
- `raw`: every column.

### portals.json (database)

There is no portal file (.PZN) for this server: no server loads one, and none exists. The way between worlds and
places is NPC teleports, so these are those: one per teleport quest. `sourceNpcId`, `npcName`, `questTitle`,
`sourceWorldId`, `sourcePosition` (the NPC), `targetWorldFile`, `targetWorldId`, `targetWorldName`, `targetPosition`,
`instanceType` (standard, group instance, arena), and its requirements (`raceRaw`, `requiredItems`, skill,
`expansionRequired`).

## Maps

As before (`.png`, `.map.json`, `.markers.json`, same coordinates; see the map export's own notes), each world in
`maps/<World>/`, now with:

- `worldId` in `.map.json` and `.markers.json`.
- Mob spawn markers: `monsterIds` (monsters.json ids), `aiConfig`, `spawnerName`, `capacity`, `chancePerThousand`;
  random-node spawns `aiWeb`, `aiWebNode`.
- New layers: `npcs` (`npcId`, `roles`), `portals` (`portalId`, `npcId`, `targetWorldId`, `targetPosition`), `shops`
  (store zones, `shopId`), `safezones` (safe and damage zones).
- Triggers decoded: `actionRaw`, `action`, `argument`: 1 activate animation (does nothing), 2 local portal (to
  `vector`), 3 external portal (needs a portal file, which no server loads), 4 play movie, 5 force pad, 6 play
  soundtrack (`soundtrackIndex`, a position in EARevolution.STK), 7 text output (SceneAssembly.cpp:2636-2759). The
  triggers run in the client only. Boomtown's "action 6, argument 49" is a music zone.

## Game version

Protocol (client) version 252, `server_version` 2026.09.21.002, `content_version` 37 (`Run\LocalBringUp\platform.cfg`).
The game files carry no version or date of their own; their modification times are in each file's `sources` but look
like copy dates. The database is `AuraGame`: the 2022 server database with the 2024-2026 patch-note changes
re-applied (Docs\MODDED_SERVER_RESTORE.md).

## Unknowns

- **Monster level**: not stored anywhere; `levelFromName` is from the name text.
- **Melee damage**: `damageMin` + `DamageSpread(min, max)`; the spread function was not traced, so melee values are
  raw.
- **Icon sheet**: `iconId` is an id in the menu icon database (the `<IconDatabase>` of a menu XML a world script
  names); which file, and the sheet layout, are not known.
- **HP bonus of items**: only the emblems' Health +10/+20 are decoded. Stat bonuses add health when the stat's
  benefit type is 1, which depends on the stat definitions in the entity templates; not exported.
- **Stat ids** other than 2 STR, 3 DEX, 4 WIS.
- **Item slots** (`locationId`) other than 12 (weapon).
- **Monster `aggressiveRaw`** values other than 0, 1, 2.
- **Ability `miscInt`, `miscInt2`, `miscInt3`, `effectBind`, `miscAmount`** beyond the tool and component of
  recipes; **`functionType`** above 8.
- **Spells**: taken as the "Magic" skill's abilities; the older "MagicOLD" skill (type 12) is in skills.json only.
- **Entity template kind**: templates have no kind field (NPC, shop, statue...); `controlTypeRaw` and `raceIdRaw`
  meanings are not proven. The one placed entity in Boomtown (template 18, Amphibious) is a copy of the playable
  Amphibious model placed in the world; what it is for is not known.
- **NPC worlds without a world**: `worldId` 0, 4, 99, 100, 101, 102, 111, 200 and 324 have no SYSWORLDSTENCILS row
  (190 NPCs). They may be disabled or storage groups.
- **Teleports to a blank or "NONE" world** (67 of 279): the server sends the name as it is; what the client then does
  is not traced. Their `targetWorldId` is null.
- **Shop NPCs without a shop zone** (26 of 68): their position is in no store zone of their world; the zone they open
  is the one holding the player, which may be nearby.
- **Quest `completedKeyEnabled`** values 3, 4 and 5; `optionalCommand` (stored, never run).
- **Soundtrack names** for trigger action 6: EARevolution.STK is not exported.
- **AI safe zones (.SZN)**: matched by world number; "Newb Zone" (world 1) lies where the nubiestarterzone (world 28)
  is, so some may use older numbering.
- **Portal file**: none exists; `portals.json` is NPC teleports only.
- **Missing world file**: Chronicle_Crypt.EXG (world 6) is not in GameFiles, so it has no map.

## Known map issue

On Boomtown's central island a tile is missing part of a reflective white surface (a rendering bug in the map
export, not in the data).

## Other map notes

- **Spread-out worlds**: some worlds keep interiors and side areas far from their main area in the same file
  (CATACOMBS, UGC_REV04/Trendor, MAINWORLD_BETA02). Their maps cover everything drawn, so they have wide empty
  stretches between the parts. The parts are all there; crop with `.map.json`'s calibration if needed.
- **Map framing**: world-sized backdrops (sky domes, sea planes, effect boxes) are left out of a map's area so the
  world is not a speck; `maps/export-maps-all.txt` lists each world's largest objects and which were left out.
- **CentralRegion**: the editor crashes intermittently while rendering it (two of three runs); its map is from a run
  that finished, with the same framing.
