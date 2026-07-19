# Designing caves yourself — the 10-minute guide

The entire cave is ONE data file: **`src/cave/data.ts`**. No modeling tools,
no editor — the geometry, collision, water, doors, and zombie pathing are all
generated from that file every time the game loads. Change a number, save,
and the browser reloads with the new cave. You can absolutely design maps.

## The workflow

1. Run the game (`npm run dev`), open `src/cave/data.ts` in any editor.
2. Change something (move a room, add a tunnel). Save. The game reloads.
3. Press **N** (noclip) in game — it's a survey mode now: full visibility,
   full brightness, fly anywhere, god mode on. Inspect your change.
4. Open **`http://localhost:5173/?view=map`** for blueprints (top + side
   views) AND the rule checks — a badge turns red if your edit broke a rule
   (disconnected the cave, removed the second route to a zone, starved an
   area of air, etc.). `npx vitest run` checks the same rules plus geometry
   (every passage swimmable, doors seal, floors flat).
5. Feel a ghost wall while playtesting? Press **P** — it flashes "PROBE
   SAVED" and appends the exact spot to `docs/probes.jsonl` so it can be
   fixed precisely later.

## Rooms (`NODES`)

```ts
{ id: 'my-room', pos: [x, y, z], radius: 3, zone: 'galleries', tags: [] },
```

- `pos` is in authored meters, y NEGATIVE = deeper. The whole map scales
  ×1.7 at load, so in-game distances are bigger than the numbers you type.
- `radius` — the room's size. `stretch: [sx, sy, sz]` squashes it into an
  ellipsoid (wide flat room: `[1.5, 0.6, 1.2]`).
- `pillars: 3` — rock columns (auto-placed clear of passages).
- `spikes: 6` — stalactites/stalagmites (air rooms).
- `floor: 0.35` — flat walkable floor that far below center (fraction of the
  vertical radius). **Rule of thumb: for a walkable room, the floor should
  end up ~1.5 m below the tunnels that enter it**, or mouths become ledges.
- Air rooms: `dry: true, waterY: <absolute y of the water surface>`. Water
  below that height, air above. Put waterY under the floor for a fully dry
  room; slightly below the floor for a bell with a pool hole.
- `falseUp: [0.5, 0.866, 0]` — the DECEPTION knob: tilts the floor/spikes
  and makes the camera orient to the lie (see the Listing Room).
- `tags` place gameplay: `airPocket`, `burrow`, `perk`, `wallBuy`, `boxSpot`,
  `chalkMound` (silt trap column), `siltyFloor`, `toy`, `tape`, `poster`…

## Tunnels (`EDGES`)

```ts
{ a: 'my-room', b: 'other-room', width: 'normal' },
```

- `width`: `'open'` (big), `'normal'`, `'squeeze'` (crawl: slow, view locked
  forward, no turning around).
- `waypoints: [[x,y,z], ...]` — bend the tunnel through these points.
- `door: { cost: 1250, kind: 'debris' | 'grate' | 'hatch' }` — a buyable door.
- `slide: true` + `waterY` — a wet one-way chute (steep = uncontrollable).
- `waterY` alone — a thin breathing gap along the tunnel ceiling.
- `tilt: { maxDeg: 90 }` — a disorientation zone (camera roll drifts).
- `falseUp: [...]` — deceptive up for the passage's air gap.

## The rules the checker enforces (DESIGN.md §5)

- Everything connected; TWO separate routes from the surface to each zone.
- Every door has a free alternate route around it.
- Air within ~45 s swim everywhere (75 s in the deep zones).
- At least: 4 squeezes, 8 dead ends, 6–10 chalk columns, 1 vertical shaft
  ≥25 m. Toys in dead ends, one of each tape, all perks placed once.

Break a rule on purpose? Fine — but do it knowingly; the viewer will name
exactly what's violated.

## Multiple maps

Today the game loads the one layout in `data.ts`. If you build a second one
(say `data-reef.ts`), keeping it selectable is a small code change (a URL
parameter switch) — ask for it in a build session and it'll be wired up.
