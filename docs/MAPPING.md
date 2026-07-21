# Designing caves yourself — THE LEVEL EDITOR

Open the game with **`?edit=1`** (or the debug panel → "Open level editor").
The whole cave appears as a labeled 3D diagram you can edit directly:

- **Click** a room, tunnel, or orange waypoint to select it — every field
  appears in the side panel (zone, radius, stretch, dry/water, floor,
  spikes, falseUp, tags, doors, slides, airGap, tilt…).
- **Drag the gizmo** to move rooms and waypoints.
- **Shift-click** a second room to connect a tunnel. **Double-click** a
  tunnel to add a waypoint (bend it).
- **+ ROOM** adds a room at the camera target. **DEL** deletes (rooms take
  their tunnels with them). **Ctrl+Z** undoes. **F** frames the selection.
- **R** (or ⟲ in the panel) switches the gizmo to ROTATION RINGS that drag
  the selection's `falseUp` — the water surface and floor tilt with it, live.
- **W** (or 💧 in the panel) is the WATER gizmo: one arrow along the room's
  up — drag it to raise/lower the pool. On a non-water room it first makes
  it a half-full air room. **🧭** toggles the water surfaces and falseUp
  arrows outside these modes (hidden by default).
- Waypoint panel → **⭘ → room** replaces a waypoint with a small turnaround
  room (splits the tunnel). Squeezes need this at every sharp bend — you
  cannot turn around inside a squeeze, and a rule check flags such bends.
- **▶ TEST** plays the layout WITHOUT saving: you drop into the game in
  noclip/god exactly where the editor camera was, with every tuning knob
  applied. **F4** in game returns to the editor — same camera, edits intact.
- **TUNING KNOBS** at the panel bottom edit every gameplay number
  (swim speed, air drain, fog…). Overrides persist (amber = changed) and
  ride into ▶ TEST; "reset all" restores stock values.
- **⛰ ROCK** generates the REAL cave mesh in the editor (~4 s) so you see
  the actual rock your data makes, not just the diagram.
- The **DESIGN §5 rule checks run live** at the bottom of the panel — break
  the two-route rule or starve a zone of air and it goes red immediately,
  with the reason.
- **💾 SAVE** writes `src/cave/layout.json` on disk (dev server). Then
  reload the game tab (or press ▶ PLAY) and swim your edit.

The layout file itself is `src/cave/layout.json` — world coordinates,
exactly what the editor shows. Hand-editing still works (fields below), and
`npx vitest run` checks everything the editor checks plus geometry
(passages swimmable, doors seal, floors flat).

In game: **N** (noclip) is a survey mode — full visibility and brightness,
fly anywhere, god on. Feel a ghost wall? Press **P** — "PROBE SAVED" flashes
and the exact spot lands in `docs/probes.jsonl` for a precise fix later.

## Rooms (`NODES`)

```ts
{ id: 'my-room', pos: [x, y, z], radius: 3, zone: 'galleries', tags: [] },
```

- `pos` is in world meters, y NEGATIVE = deeper. Editor coordinates = game
  coordinates (the old ×1.7 load-time scale is retired).
- `radius` — the room's size. `stretch: [sx, sy, sz]` squashes it into an
  ellipsoid (wide flat room: `[1.5, 0.6, 1.2]`).
- `pillars: 3` — rock columns (auto-placed clear of passages).
- `spikes: 6` — stalactites/stalagmites (air rooms).
- `floor: 0.35` — flat walkable floor that far below center (fraction of the
  vertical radius). **Rule of thumb: for a walkable room, the floor should
  end up ~1.5 m below the tunnels that enter it**, or mouths become ledges.
- Air rooms: `dry: true`. That alone = the whole room is air. Add
  `water: 0..1` for a pool — the FILL FRACTION of the room along its (false)
  up, like `floor`: 0.3 = bottom 30% is water. It moves and tilts with the
  room. Slightly negative (≥ −0.5) puts the surface below the room, down its
  entrance shaft (bells). Easiest set with the editor's W water gizmo.
- `falseUp: [0.5, 0.866, 0]` — the DECEPTION knob: tilts the floor/spikes,
  the WATER SURFACE, and the camera's sense of up (see the Listing Room).
  Easiest set with the editor's R rotate gizmo.
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
  (2026-07-21: costs are being replaced by found openers — dynamite for
  debris, keys for grates; the Abyss hatch tolls +5 shifts. DESIGN §10.3.)
- `powerGate: true` — NOT a purchase: a sealed gate that **grinds open
  automatically the moment the Pile (power) is switched on**. Use it for
  passages that should open with power, like the classic PaP grate. `gateAt`
  sets where along the passage the gate sits (0..1, default 0.5). The
  current map has none — the editor checkbox binds one anywhere you like.
- `slide: true` + `waterY` — a wet one-way chute; `waterY` is the absolute
  plunge line where it hits its pool.
- `airGap: 0.5` — a breathing gap: that many meters of air hugging the
  tunnel CEILING, following the passage profile the whole way.
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

Today the game loads the one layout in `layout.json`. Use **⬇ JSON** in the
editor to export copies of different designs; keeping several selectable in
game is a small code change (a URL parameter switch) — ask for it in a build
session and it'll be wired up.
