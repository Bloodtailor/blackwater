// THE MAP. Single source of truth for the cave layout (DESIGN.md §16 rule 1).
// Renderer, collision, pathing, spawning, and the map viewer all derive from
// this file. Layout requirements: DESIGN.md §5. Placements: LORE.md §3–§7.
// Y is depth (negative down). Units are meters.

export type Zone = 'sinkhole' | 'galleries' | 'maze' | 'throat' | 'abyss';

export type NodeTag =
  | 'airPocket'
  | 'ambushPocket'
  | 'burrow'
  | 'landmark'
  | 'siltyFloor'
  | 'chalkMound'
  | 'perk'
  | 'wallBuy'
  | 'boxSpot'
  | 'power'
  | 'pap'
  | 'heart'
  | 'tape'
  | 'cache'
  | 'tieOff'
  | 'poster'
  | 'toy'
  | 'jukebox'
  | 'guardianPost'
  | 'surface'; // head-above-water here (platform / open pool)

export type PerkId =
  | 'barnacleHide'
  | 'secondWind'
  | 'greasedGears'
  | 'triggerFish'
  | 'deepPockets'
  | 'ironLungs'
  | 'catEyes'
  | 'finKick'
  | 'steadyHands';

export type WeaponId = 'speargun' | 'pneuDriver' | 'flechette' | 'harpoon' | 'lineLance';
export type VendorId = 'battery' | 'chemlights' | 'reel';

export interface CaveNode {
  id: string;
  pos: [number, number, number];
  radius: number;
  /** Per-axis multipliers of radius — rooms are ellipsoids, not spheres. */
  stretch?: [number, number, number];
  /** Rock columns floor-to-ceiling inside the chamber (count). */
  pillars?: number;
  /**
   * Part of an AIR region (air bell / dry passage). Requires `waterY`: the
   * absolute y of this region's local water surface (user rework 2026-07-18:
   * air must be physically coherent — water exists only below waterY, and a
   * fully dry room simply puts waterY below its floor).
   */
  dry?: boolean;
  /** Local water surface (absolute y, authored scale) for dry regions. */
  waterY?: number;
  /**
   * Flat(ter) floor: carve the room's bottom at pos.y − ry*floor with a soft
   * smooth-max blend (user 2026-07-18: rooms — especially air rooms — must
   * not read as spheres; flatter floors, curved soft edges).
   */
  floor?: number;
  /** Stalactites + stalagmites (count) — air rooms only (user 2026-07-18). */
  spikes?: number;
  zone: Zone;
  tags: NodeTag[];
  contents?: {
    perk?: PerkId;
    wallBuy?: WeaponId;
    vendor?: VendorId;
    landmarkName?: string;
    burrowActiveFromRound?: number;
    tape?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
    poster?: 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G10' | 'G11' | 'G12' | 'G13';
    toyColor?: 'red' | 'blue' | 'yellow';
    cache?: 'battery' | 'chemlights';
  };
}

export interface CaveEdge {
  a: string;
  b: string;
  width: 'open' | 'normal' | 'squeeze';
  waypoints?: [number, number, number][];
  tilt?: { maxDeg: number };
  door?: { cost: number; kind: 'debris' | 'grate' | 'hatch'; at?: number }; // at: arc fraction along the passage (default 0.5)
  powerGate?: boolean; // PaP grate: opens with power, not points
  /** Wet one-way slide (user 2026-07-18): walking here loses all traction and
   *  gravity hauls you down the shaft; you cannot climb back up. */
  slide?: boolean;
  /** Water surface override for this passage (absolute y, authored scale) —
   *  e.g. where a slide plunges into its pool. */
  waterY?: number;
}

export const NODES: CaveNode[] = [
  // ── SINKHOLE (0 … −10 m) — daylight, Lowe's camp, the 1968 winch head ──
  { id: 'sink-platform', pos: [6, 0.7, 2], radius: 4, stretch: [1.6, 0.4, 1.2], zone: 'sinkhole',
    tags: ['surface', 'tieOff', 'tape', 'poster'],
    contents: { tape: 'T1', poster: 'G11' } },
  { id: 'sink-blueprint', pos: [8, 0.7, 0], radius: 1.5, zone: 'sinkhole',
    tags: ['surface', 'poster'], contents: { poster: 'G10' } },
  { id: 'sink-pool', pos: [0, -5, 0], radius: 6, stretch: [1.4, 0.9, 1.2], zone: 'sinkhole', tags: ['surface', 'tieOff'] },
  { id: 'sink-wall-e', pos: [6, -7, 3], radius: 2.5, zone: 'sinkhole',
    tags: ['wallBuy'], contents: { wallBuy: 'speargun' } },
  { id: 'sink-wall-w', pos: [-5, -7, -3], radius: 2.5, zone: 'sinkhole',
    tags: ['wallBuy'], contents: { wallBuy: 'pneuDriver' } },
  { id: 'sink-b1', pos: [7, -8, -2], radius: 1.2, zone: 'sinkhole',
    tags: ['burrow'], contents: { burrowActiveFromRound: 1 } },
  { id: 'sink-b2', pos: [-6, -9, 3], radius: 1.2, zone: 'sinkhole',
    tags: ['burrow'], contents: { burrowActiveFromRound: 3 } },
  { id: 'sink-b3', pos: [1, -9, 6], radius: 1.2, zone: 'sinkhole',
    tags: ['burrow'], contents: { burrowActiveFromRound: 5 } },
  { id: 'sink-shaft', pos: [0, -10, -5], radius: 2.5, zone: 'sinkhole', tags: ['tieOff'] },
  { id: 'sink-crack', pos: [5, -10, 5], radius: 1.2, zone: 'sinkhole', tags: [] },

  // ── GALLERIES (−12 … −25 m) — berthing ring, rec room, the Pile ──
  { id: 'gal-entry', pos: [0, -14, -8], radius: 3, zone: 'galleries', tags: ['tieOff'] },
  { id: 'gal-ring-w', pos: [-8, -16, -10], radius: 2.5, zone: 'galleries',
    tags: ['wallBuy', 'siltyFloor'], contents: { wallBuy: 'flechette' } },
  // Air bell (user rework 2026-07-18): flat dry floor above a pool hole where
  // the entrance shaft pierces it; water only below waterY.
  { id: 'gal-air1', pos: [-8, -10.6, -10], radius: 4, stretch: [1.5, 0.75, 1.4], dry: true, waterY: -11.54,
    floor: 0.32, spikes: 4, zone: 'galleries', tags: ['airPocket'] },

  // ── THE DRY REACH — open-air walkable passages off the west bell (user
  // request 2026-07-18): stalactite halls, unreachable teaser openings high
  // in the walls, and the wet slide shaft you cannot climb back up ──
  // Walkable-room floor rule: the flat floor sits ~one tunnel-radius below the
  // arriving tunnel centerline, so passage mouths meet floors flush (no
  // troughs, no unclimbable ledges).
  { id: 'dry-hall', pos: [-13, -10.4, -13], radius: 2.4, stretch: [1.1, 0.75, 1.1], dry: true, waterY: -12,
    floor: 0.7, spikes: 5, zone: 'galleries', tags: ['airPocket'] },
  { id: 'dry-gallery', pos: [-18, -8.6, -16], radius: 3.6, stretch: [1.15, 1.5, 1.05], dry: true, waterY: -12,
    floor: 0.2, spikes: 9, zone: 'galleries', tags: ['airPocket'] },
  // teasers: real cavities mouthing 6–9 m up the gallery walls; nothing connects
  { id: 'dry-teaser1', pos: [-21.5, -4.2, -18.5], radius: 1.5, dry: true, waterY: -12, zone: 'galleries', tags: [] },
  { id: 'dry-teaser2', pos: [-15, -3.6, -19], radius: 1.3, dry: true, waterY: -12, zone: 'galleries', tags: [] },
  { id: 'dry-slide-top', pos: [-20, -10.5, -20], radius: 2, stretch: [1.2, 0.8, 1.2], dry: true, waterY: -12.5,
    floor: 0.79, spikes: 3, zone: 'galleries', tags: [] },
  { id: 'slide-pool', pos: [-14, -22.5, -24], radius: 2.4, zone: 'galleries', tags: [] },
  // turnaround bulb at the end of the long dead-end squeeze (user 2026-07-18)
  { id: 'gal-turn', pos: [17, -10, -14], radius: 1.5, zone: 'galleries', tags: [] },
  { id: 'gal-berthing', pos: [-14, -18, -4], radius: 3.5, stretch: [1.6, 0.55, 0.9], zone: 'galleries',
    tags: ['perk', 'wallBuy', 'poster', 'tieOff'],
    contents: { perk: 'secondWind', vendor: 'reel', poster: 'G3' } },
  { id: 'gal-rec', pos: [-16, -19, 4], radius: 4, stretch: [1.5, 0.55, 1.2], pillars: 2, zone: 'galleries',
    tags: ['landmark', 'jukebox', 'tape', 'poster'],
    contents: { landmarkName: 'Rec Room', tape: 'T2', poster: 'G12' } },
  { id: 'gal-mess', pos: [-10, -21, 10], radius: 3, stretch: [1.3, 0.6, 1.1], zone: 'galleries',
    tags: ['wallBuy', 'siltyFloor'], contents: { vendor: 'chemlights' } },
  { id: 'gal-pile', pos: [0, -23, 14], radius: 4, stretch: [1.3, 0.75, 1.3], pillars: 1, zone: 'galleries',
    tags: ['power', 'landmark', 'tape', 'poster', 'tieOff'],
    contents: { landmarkName: 'The Pile', tape: 'T3', poster: 'G5' } },
  { id: 'gal-air2', pos: [0, -19.5, 14], radius: 1.5, dry: true, waterY: -19.5, zone: 'galleries',
    tags: ['airPocket', 'ambushPocket'] },
  { id: 'gal-ring-e', pos: [9, -18, 8], radius: 2.5, zone: 'galleries',
    tags: ['perk'], contents: { perk: 'barnacleHide' } },
  { id: 'gal-box', pos: [13, -16, 2], radius: 3, zone: 'galleries',
    tags: ['boxSpot', 'wallBuy', 'poster'], contents: { vendor: 'battery', poster: 'G7' } },
  { id: 'gal-air3', pos: [13, -12.5, 2], radius: 1.5, dry: true, waterY: -12.5, zone: 'galleries', tags: ['airPocket'] },
  { id: 'gal-ring-ne', pos: [8, -14, -5], radius: 2.2, zone: 'galleries', tags: ['siltyFloor'] },
  { id: 'gal-spur-battery', pos: [-20, -20, -9], radius: 1.8, zone: 'galleries',
    tags: ['cache'], contents: { cache: 'battery' } },
  { id: 'gal-spur-toy', pos: [-21, -17, 9], radius: 1.8, zone: 'galleries',
    tags: ['toy'], contents: { toyColor: 'red' } },
  { id: 'gal-spur-empty1', pos: [-12, -25, 16], radius: 1.8, zone: 'galleries', tags: ['siltyFloor'] },
  { id: 'gal-spur-empty2', pos: [11, -11, -10], radius: 1.8, zone: 'galleries', tags: [] },
  { id: 'gal-b1', pos: [-9, -17, -6], radius: 1.2, zone: 'galleries',
    tags: ['burrow'], contents: { burrowActiveFromRound: 3 } },
  { id: 'gal-b2', pos: [2, -22, 11], radius: 1.2, zone: 'galleries',
    tags: ['burrow'], contents: { burrowActiveFromRound: 5 } },
  { id: 'gal-b3', pos: [12, -17, 5], radius: 1.2, zone: 'galleries',
    tags: ['burrow'], contents: { burrowActiveFromRound: 7 } },

  // ── MAZE (−26 … −44 m) — stores, infirmary, look-alike junctions ──
  { id: 'mz-gate', pos: [10, -27, 12], radius: 2.2, zone: 'maze', tags: ['tieOff'] },
  { id: 'mz-west', pos: [-12, -28, 16], radius: 2.2, zone: 'maze', tags: ['siltyFloor'] },
  { id: 'mz-a', pos: [-6, -30, 18], radius: 2, zone: 'maze', tags: [] },
  { id: 'mz-b', pos: [2, -31, 20], radius: 2, zone: 'maze', tags: ['siltyFloor'] },
  { id: 'mz-c', pos: [9, -32, 22], radius: 2, zone: 'maze', tags: [] },
  { id: 'mz-air1', pos: [2, -27.5, 20], radius: 1.5, dry: true, waterY: -27.5, zone: 'maze', tags: ['airPocket'] },
  { id: 'mz-organ', pos: [-10, -34, 24], radius: 3.5, stretch: [0.9, 1.6, 0.9], pillars: 5, zone: 'maze',
    tags: ['landmark', 'perk', 'wallBuy'],
    contents: { landmarkName: 'The Organ Pipes', perk: 'greasedGears', wallBuy: 'harpoon' } },
  { id: 'mz-e', pos: [0, -35, 26], radius: 2, zone: 'maze', tags: ['chalkMound'] },
  { id: 'mz-f', pos: [8, -36, 28], radius: 2, zone: 'maze', tags: [] },
  { id: 'mz-infirm', pos: [-6, -38, 30], radius: 3, zone: 'maze',
    tags: ['perk', 'wallBuy', 'tape', 'poster'],
    contents: { perk: 'ironLungs', vendor: 'chemlights', tape: 'T4', poster: 'G6' } },
  { id: 'mz-air2', pos: [-6, -32.9, 30], radius: 4, stretch: [1.5, 0.75, 1.4], dry: true, waterY: -33.84,
    floor: 0.32, spikes: 5, zone: 'maze', tags: ['airPocket', 'ambushPocket'] },
  { id: 'mz-stores', pos: [4, -39, 33], radius: 3.5, stretch: [1.4, 0.7, 1.2], pillars: 2, zone: 'maze',
    tags: ['boxSpot', 'perk', 'wallBuy', 'poster'],
    contents: { perk: 'steadyHands', vendor: 'battery', poster: 'G4' } },
  { id: 'mz-chapel', pos: [-3, -41, 36], radius: 4, stretch: [1.25, 1.3, 1.1], pillars: 3, zone: 'maze',
    tags: ['landmark', 'chalkMound', 'siltyFloor'],
    contents: { landmarkName: 'The White Chapel' } },
  { id: 'mz-coil', pos: [10, -42, 36], radius: 3, zone: 'maze',
    tags: ['landmark', 'perk', 'wallBuy'],
    contents: { landmarkName: 'The Coil', perk: 'triggerFish', wallBuy: 'lineLance' } },
  { id: 'mz-air3', pos: [10, -38.5, 36], radius: 1.5, dry: true, waterY: -38.5, zone: 'maze', tags: ['airPocket'] },
  { id: 'mz-d1', pos: [-14, -36, 20], radius: 1.8, zone: 'maze',
    tags: ['toy'], contents: { toyColor: 'blue' } },
  { id: 'mz-d2', pos: [14, -33, 25], radius: 1.8, zone: 'maze',
    tags: ['cache'], contents: { cache: 'battery' } },
  { id: 'mz-turn', pos: [18, -30, 20], radius: 1.5, zone: 'maze', tags: [] },
  { id: 'mz-d3', pos: [-11, -42, 33], radius: 1.8, zone: 'maze',
    tags: ['poster'], contents: { poster: 'G8' } },
  { id: 'mz-d4', pos: [16, -39, 31], radius: 1.8, zone: 'maze', tags: ['siltyFloor', 'chalkMound'] },
  // deep pocket under the Chapel (moved down 2026-07-19: its ceiling grazed
  // the Chapel bowl — noise-thin wall = see-through-but-solid ghost wall)
  { id: 'mz-d5', pos: [-1, -47.5, 40], radius: 1.8, zone: 'maze',
    tags: ['cache', 'chalkMound'], contents: { cache: 'chemlights' } },
  { id: 'mz-b1', pos: [-4, -32, 22], radius: 1.2, zone: 'maze',
    tags: ['burrow'], contents: { burrowActiveFromRound: 6 } },
  { id: 'mz-b2', pos: [6, -37, 30], radius: 1.2, zone: 'maze',
    tags: ['burrow'], contents: { burrowActiveFromRound: 8 } },
  { id: 'mz-b3', pos: [-8, -40, 34], radius: 1.2, zone: 'maze',
    tags: ['burrow'], contents: { burrowActiveFromRound: 10 } },

  // ── THROAT (−44 … −70 m) — the bore itself, straight down ──
  { id: 'throat-rim', pos: [5, -45, 40], radius: 3.5, zone: 'throat',
    tags: ['perk', 'tape', 'chalkMound', 'tieOff'],
    contents: { perk: 'finKick', tape: 'T5' } },
  { id: 'throat-rim-air', pos: [5, -40.4, 40], radius: 4, stretch: [1.5, 0.75, 1.4], dry: true, waterY: -41.34,
    floor: 0.32, spikes: 6, zone: 'throat', tags: ['airPocket'] },
  { id: 'throat-mid', pos: [5, -58, 40], radius: 2, zone: 'throat', tags: [] },
  { id: 'throat-bottom', pos: [5, -70, 40], radius: 2.5, zone: 'throat', tags: ['tieOff'] },

  // ── ABYSS (−70 … −80 m) — the Cathedral, the Bench, the Heart ──
  { id: 'abyss-hall', pos: [5, -73, 46], radius: 3, stretch: [1.3, 0.8, 1.1], zone: 'abyss',
    tags: ['wallBuy'], contents: { vendor: 'battery' } },
  { id: 'abyss-box', pos: [10, -74, 48], radius: 2.5, zone: 'abyss', tags: ['boxSpot'] },
  { id: 'abyss-toy', pos: [12, -71, 44], radius: 1.8, zone: 'abyss',
    tags: ['toy'], contents: { toyColor: 'yellow' } },
  { id: 'cathedral', pos: [0, -76, 52], radius: 10, stretch: [1.5, 2.1, 1.3], pillars: 6, zone: 'abyss',
    tags: ['landmark', 'perk', 'guardianPost', 'tieOff'],
    contents: { landmarkName: 'The Cathedral', perk: 'catEyes' } },
  { id: 'abyss-air', pos: [-6, -72, 55], radius: 1.5, dry: true, waterY: -72, zone: 'abyss', tags: ['airPocket'] },
  { id: 'pap-chamber', pos: [-7, -75, 48], radius: 3, zone: 'abyss',
    tags: ['pap', 'perk'], contents: { perk: 'deepPockets' } },
  { id: 'drill-head', pos: [2, -79, 57], radius: 3, stretch: [1.3, 0.7, 1.3], zone: 'abyss',
    tags: ['guardianPost', 'tape', 'poster'], contents: { tape: 'T6', poster: 'G13' } },
  { id: 'heart-apse', pos: [7, -79, 59], radius: 2.5, stretch: [1.1, 1.3, 1.0], zone: 'abyss', tags: ['heart'] },
  { id: 'abyss-b1', pos: [-8, -82, 54], radius: 1.2, zone: 'abyss',
    tags: ['burrow'], contents: { burrowActiveFromRound: 10 } },
  { id: 'abyss-b2', pos: [6, -77, 54], radius: 1.2, zone: 'abyss',
    tags: ['burrow'], contents: { burrowActiveFromRound: 12 } },

  // ── THE CHIMNEY — natural fissure, the free/nasty second route down ──
  { id: 'chim-1', pos: [-8, -50, 40], radius: 1.6, zone: 'throat', tags: ['siltyFloor', 'chalkMound'] },
  { id: 'chim-2', pos: [-10, -62, 46], radius: 1.6, zone: 'throat', tags: [] },
];

export const EDGES: CaveEdge[] = [
  // Sinkhole
  { a: 'sink-platform', b: 'sink-pool', width: 'open' },
  { a: 'sink-platform', b: 'sink-blueprint', width: 'open' },
  { a: 'sink-pool', b: 'sink-wall-e', width: 'open' },
  { a: 'sink-pool', b: 'sink-wall-w', width: 'open' },
  { a: 'sink-pool', b: 'sink-b1', width: 'squeeze' },
  { a: 'sink-pool', b: 'sink-b2', width: 'squeeze' },
  { a: 'sink-pool', b: 'sink-b3', width: 'squeeze' },
  { a: 'sink-pool', b: 'sink-shaft', width: 'normal' },
  { a: 'sink-pool', b: 'sink-crack', width: 'normal' },
  // Two ways into the Galleries: main artery door vs free squeeze crack
  { a: 'sink-shaft', b: 'gal-entry', width: 'normal', door: { cost: 750, kind: 'debris' } },
  { a: 'sink-crack', b: 'gal-ring-ne', width: 'squeeze', waypoints: [[7, -12, 0]] },

  // Galleries ring
  { a: 'gal-entry', b: 'gal-ring-w', width: 'normal' },
  // bell entrance: a person-wide shaft from below — the air stays trapped
  { a: 'gal-ring-w', b: 'gal-air1', width: 'normal' },
  { a: 'gal-ring-w', b: 'gal-berthing', width: 'normal' },
  { a: 'gal-berthing', b: 'gal-rec', width: 'open' },
  { a: 'gal-rec', b: 'gal-mess', width: 'normal' },
  { a: 'gal-mess', b: 'gal-pile', width: 'normal' },
  { a: 'gal-pile', b: 'gal-air2', width: 'open' },
  { a: 'gal-pile', b: 'gal-ring-e', width: 'normal' },
  { a: 'gal-ring-e', b: 'gal-box', width: 'normal' },
  { a: 'gal-box', b: 'gal-air3', width: 'open' },
  { a: 'gal-box', b: 'gal-ring-ne', width: 'normal' },
  { a: 'gal-ring-ne', b: 'gal-entry', width: 'normal' },
  // Ring shortcut: squeeze across + purchasable grate
  { a: 'gal-berthing', b: 'gal-ring-e', width: 'squeeze', waypoints: [[-3, -18, 3]] },
  { a: 'gal-entry', b: 'gal-pile', width: 'normal', door: { cost: 1000, kind: 'grate' }, waypoints: [[0, -19, 3]] },
  // The Dry Reach: walkable air passages, teasers, and the one-way wet slide
  { a: 'gal-air1', b: 'dry-hall', width: 'normal' },
  { a: 'dry-hall', b: 'dry-gallery', width: 'normal' },
  { a: 'dry-gallery', b: 'dry-teaser1', width: 'normal' },
  { a: 'dry-gallery', b: 'dry-teaser2', width: 'normal' },
  { a: 'dry-gallery', b: 'dry-slide-top', width: 'normal' },
  { a: 'dry-slide-top', b: 'slide-pool', width: 'normal', slide: true, waterY: -20.2 },
  { a: 'slide-pool', b: 'gal-ring-w', width: 'normal', waypoints: [[-12, -20, -17]] },

  // Spurs (dead ends)
  { a: 'gal-berthing', b: 'gal-spur-battery', width: 'normal' },
  { a: 'gal-rec', b: 'gal-spur-toy', width: 'normal' },
  { a: 'gal-mess', b: 'gal-spur-empty1', width: 'normal' },
  { a: 'gal-ring-ne', b: 'gal-spur-empty2', width: 'normal' },
  // long dead-end squeeze to a turnaround bulb (user 2026-07-18)
  { a: 'gal-spur-empty2', b: 'gal-turn', width: 'squeeze', waypoints: [[13, -10.5, -13], [15.5, -9, -11]] },
  // Burrow stubs
  { a: 'gal-ring-w', b: 'gal-b1', width: 'squeeze' },
  { a: 'gal-pile', b: 'gal-b2', width: 'squeeze' },
  { a: 'gal-box', b: 'gal-b3', width: 'squeeze' },

  // Two ways into the Maze: main door (near box) vs long dark free route (from mess)
  { a: 'gal-box', b: 'mz-gate', width: 'normal', door: { cost: 1250, kind: 'debris' }, tilt: { maxDeg: 90 } },
  { a: 'gal-mess', b: 'mz-west', width: 'normal', waypoints: [[-16, -24, 14], [-15, -26, 16]] },

  // Maze lattice (look-alike junctions)
  { a: 'mz-gate', b: 'mz-c', width: 'normal' },
  { a: 'mz-west', b: 'mz-a', width: 'normal' },
  { a: 'mz-a', b: 'mz-b', width: 'normal' },
  { a: 'mz-b', b: 'mz-c', width: 'normal' },
  { a: 'mz-b', b: 'mz-air1', width: 'open' },
  { a: 'mz-a', b: 'mz-organ', width: 'normal' },
  { a: 'mz-b', b: 'mz-e', width: 'normal' },
  { a: 'mz-c', b: 'mz-f', width: 'squeeze' },
  { a: 'mz-organ', b: 'mz-e', width: 'normal' },
  { a: 'mz-e', b: 'mz-f', width: 'normal' },
  { a: 'mz-organ', b: 'mz-infirm', width: 'normal' },
  { a: 'mz-e', b: 'mz-infirm', width: 'normal', tilt: { maxDeg: 90 } },
  { a: 'mz-infirm', b: 'mz-air2', width: 'normal' },
  { a: 'mz-f', b: 'mz-stores', width: 'normal' },
  { a: 'mz-infirm', b: 'mz-chapel', width: 'normal' },
  { a: 'mz-stores', b: 'mz-chapel', width: 'normal' },
  { a: 'mz-stores', b: 'mz-coil', width: 'normal' },
  { a: 'mz-chapel', b: 'mz-coil', width: 'squeeze', waypoints: [[3, -42, 37]] },
  { a: 'mz-coil', b: 'mz-air3', width: 'open' },
  // Maze shortcut grate: gate straight to stores
  // Eastern bypass arc: swings wide of the lattice so its door plug can't graze free routes
  { a: 'mz-gate', b: 'mz-stores', width: 'normal', door: { cost: 1250, kind: 'grate' }, waypoints: [[15, -31, 17], [16, -36, 29]] },
  // Dead ends
  { a: 'mz-organ', b: 'mz-d1', width: 'normal' },
  { a: 'mz-c', b: 'mz-d2', width: 'normal' },
  { a: 'mz-d2', b: 'mz-turn', width: 'squeeze', waypoints: [[16, -31.5, 23.5], [18.5, -32, 21.5]] },
  { a: 'mz-infirm', b: 'mz-d3', width: 'normal' },
  { a: 'mz-d4', b: 'mz-stores', width: 'squeeze' },
  { a: 'mz-chapel', b: 'mz-d5', width: 'normal' },
  // Burrow stubs
  { a: 'mz-b', b: 'mz-b1', width: 'squeeze' },
  { a: 'mz-f', b: 'mz-b2', width: 'squeeze' },
  { a: 'mz-chapel', b: 'mz-b3', width: 'squeeze' },

  // Two ways to the Throat rim
  { a: 'mz-coil', b: 'throat-rim', width: 'normal', door: { cost: 1500, kind: 'debris' } },
  { a: 'mz-chapel', b: 'throat-rim', width: 'normal', waypoints: [[1, -44, 39]] },
  { a: 'throat-rim', b: 'throat-rim-air', width: 'normal' },

  // The bore: straight down, fully inverted tilt possible
  { a: 'throat-rim', b: 'throat-mid', width: 'normal', tilt: { maxDeg: 180 } },
  { a: 'throat-mid', b: 'throat-bottom', width: 'normal', tilt: { maxDeg: 180 } },

  // Two ways into the Abyss hall: pressure hatch vs nasty squeeze
  { a: 'throat-bottom', b: 'abyss-hall', width: 'normal', door: { cost: 2000, kind: 'hatch' } },
  { a: 'throat-bottom', b: 'abyss-hall', width: 'squeeze', waypoints: [[9, -72.5, 43.5]] },

  // The Chimney: free, horrendous second route down (Maze → Cathedral)
  { a: 'mz-chapel', b: 'chim-1', width: 'squeeze', waypoints: [[-6, -46, 38]] },
  { a: 'chim-1', b: 'chim-2', width: 'squeeze', tilt: { maxDeg: 180 } },
  { a: 'chim-2', b: 'cathedral', width: 'normal', tilt: { maxDeg: 180 }, waypoints: [[-6, -70, 50]] },

  // Abyss
  { a: 'abyss-hall', b: 'abyss-box', width: 'normal' },
  { a: 'abyss-hall', b: 'abyss-toy', width: 'normal' },
  { a: 'abyss-hall', b: 'cathedral', width: 'open' },
  { a: 'cathedral', b: 'abyss-air', width: 'squeeze', waypoints: [[-5, -74, 54]] },
  { a: 'cathedral', b: 'pap-chamber', width: 'normal', powerGate: true },
  { a: 'cathedral', b: 'drill-head', width: 'open' },
  { a: 'drill-head', b: 'heart-apse', width: 'normal' },
  { a: 'cathedral', b: 'abyss-b1', width: 'squeeze' },
  { a: 'drill-head', b: 'abyss-b2', width: 'squeeze' },
];

// ── World scale ──
// Authored coordinates above are compact for readability; the built world is
// larger (user playtest 2026-07-18: cave felt too small, rooms too divot-like).
// Positions scale uniformly; radii scale progressively (big rooms grow more);
// burrows shrink to cracks.
const S = 1.7;
for (const n of NODES) {
  n.pos = [n.pos[0] * S, n.pos[1] * S, n.pos[2] * S];
  n.radius *= n.radius >= 3 ? 1.35 : n.radius >= 1.8 ? 1.15 : 1;
  if (n.tags.includes('burrow')) n.radius = 1.0;
  if (n.waterY !== undefined) n.waterY *= S;
}
for (const e of EDGES) {
  if (e.waypoints) e.waypoints = e.waypoints.map((w) => [w[0] * S, w[1] * S, w[2] * S] as [number, number, number]);
  if (e.waterY !== undefined) e.waterY *= S;
}

// ── Helpers (graph utilities shared by all systems) ──

const nodeMap = new Map(NODES.map((n) => [n.id, n]));

export function getNode(id: string): CaveNode {
  const n = nodeMap.get(id);
  if (!n) throw new Error(`unknown cave node: ${id}`);
  return n;
}

export function edgeLength(e: CaveEdge): number {
  const pts: [number, number, number][] = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const dz = pts[i][2] - pts[i - 1][2];
    len += Math.hypot(dx, dy, dz);
  }
  return len;
}

export interface Adjacency {
  [nodeId: string]: { edge: CaveEdge; other: string; length: number }[];
}

export function buildAdjacency(edges: CaveEdge[] = EDGES): Adjacency {
  const adj: Adjacency = {};
  for (const n of NODES) adj[n.id] = [];
  for (const e of edges) {
    const len = edgeLength(e);
    adj[e.a].push({ edge: e, other: e.b, length: len });
    adj[e.b].push({ edge: e, other: e.a, length: len });
  }
  return adj;
}

// The cenote mouth: an open shaft of sky above the platform. Part of the map
// (the sinkhole is open-air, LORE §3); carved by the SDF like everything else.
// Post-scale coordinates.
export const SKY_SHAFT = { a: [0, 1, 0] as [number, number, number], b: [0, 26, 0] as [number, number, number], r: 10 };

/**
 * Region ref (node id / `a~b` edge ref, as produced by sdf regionAt) → local
 * water surface y. Refs absent from the map are fully flooded (no surface).
 * The physical rule (user rework 2026-07-18): air regions carry their own
 * water line; transition passages inherit it so you surface exactly where the
 * shaft breaches the pool.
 */
export function buildAirWaterMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of NODES) {
    if (n.dry && n.waterY !== undefined) map.set(n.id, n.waterY);
  }
  for (const e of EDGES) {
    const ref = `${e.a}~${e.b}`;
    if (e.waterY !== undefined) {
      map.set(ref, e.waterY);
      continue;
    }
    const a = getNode(e.a);
    const b = getNode(e.b);
    if (a.dry && b.dry) map.set(ref, Math.min(a.waterY ?? Infinity, b.waterY ?? Infinity));
    else if (a.dry && a.waterY !== undefined) map.set(ref, a.waterY);
    else if (b.dry && b.waterY !== undefined) map.set(ref, b.waterY);
  }
  return map;
}

/** Edge ref (`a~b`, as regionAt reports) → full polyline. Used by the squeeze
 *  view-cone to know the passage direction at any point along it. */
export function buildEdgePolylines(): Map<string, [number, number, number][]> {
  const m = new Map<string, [number, number, number][]>();
  for (const e of EDGES) {
    m.set(`${e.a}~${e.b}`, [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos]);
  }
  return m;
}

/** Slide regions: edge ref → unit downhill vector (walk mode loses traction here). */
export function buildSlideRegions(): Map<string, [number, number, number]> {
  const map = new Map<string, [number, number, number]>();
  for (const e of EDGES) {
    if (!e.slide) continue;
    const a = getNode(e.a).pos;
    const b = getNode(e.b).pos;
    const high = a[1] >= b[1] ? a : b;
    const low = a[1] >= b[1] ? b : a;
    const d: [number, number, number] = [low[0] - high[0], low[1] - high[1], low[2] - high[2]];
    const len = Math.hypot(...d) || 1;
    map.set(`${e.a}~${e.b}`, [d[0] / len, d[1] / len, d[2] / len]);
  }
  return map;
}

export const ZONE_HUBS: Record<Zone, string> = {
  sinkhole: 'sink-pool',
  galleries: 'gal-entry',
  maze: 'mz-e',
  throat: 'throat-rim',
  abyss: 'cathedral',
};

export const ZONE_COLORS: Record<Zone, number> = {
  sinkhole: 0x4fc3f7,
  galleries: 0x81c784,
  maze: 0xffb74d,
  throat: 0xba68c8,
  abyss: 0x5c6bc0,
};
