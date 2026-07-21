// The Roster of 41 (M14.5, DESIGN §8.6): every Drowned is a PERSON. This is
// the crew book — internal data, NEVER shown to the player. The first seven
// rows are canon from T6's duty-roster read (LORE §5): "Albrecht, forward
// watch. Ames, galley. Barrow, lamps. Bell, stores. Calloway, drill. Carver,
// drill. Deem—" (the tape cuts off mid-name; his role is ours to assign).
//
// Never more than one of each man exists at a time: the population IS the
// roster. Spawning = coming on watch; despawning = going below; a kill
// returns the man once his body is recovered off the water (corpse removal).
//
// Watch-bill weights carry ALL the drop balance: a carrier always visibly
// carries and always drops — scarcity means he walks fewer watches, never
// that his pockets are sometimes empty (the fiction would break).
//
// The Lamp Man (DESIGN §8.5) holds NO row here. The book says 41. Whether he
// is the forty-second is never resolved — void #9. Do not count them together.
//
// Pure logic, no THREE — unit-tested in roster.test.ts.

import { TUNING } from '../tuning';

export type CarryItem = 'dryCell' | 'ammo' | 'slug';
export type Quirk = 'pauser' | 'runner' | 'lingerer';

/** What a carrier's recovery sheds (drops.ts DropIds — supplies only;
 *  progression items stay placed in the world, DESIGN §8.6). */
export const CARRY_DROP: Record<CarryItem, 'batterySurge' | 'maxAmmo' | 'fuelSlug'> = {
  dryCell: 'batterySurge',
  ammo: 'maxAmmo',
  slug: 'fuelSlug',
};

export interface CrewProfile {
  index: number;
  name: string;
  role: string;
  /** Watch-bill spawn weight (relative draw odds when off watch). */
  weight: number;
  speedMult: number;
  hpMult: number;
  /** Deterministic seed for the procedural rig (build, palette, gear prop). */
  rigSeed: number;
  /** Per-man moan identity: fixed sample + fixed pitch. */
  voice: { sample: number; rate: number };
  quirk?: Quirk;
  carry?: CarryItem;
}

// name, role, optional quirk/carry. Order fixed forever — index is identity.
// Roles are the site's own departments (LORE §3); one gear prop each derives
// from the role in drowned.ts. Quirks per DESIGN §8.6: the workstation-
// pauser, the runner, the one who stands too long at the burrow mouth.
const BOOK: [name: string, role: string, quirk?: Quirk, carry?: CarryItem][] = [
  ['Albrecht', 'forward watch'],
  ['Ames', 'galley', 'pauser'],
  ['Barrow', 'lamps', undefined, 'dryCell'],
  ['Bell', 'stores', undefined, 'ammo'],
  ['Calloway', 'drill'],
  ['Carver', 'drill', 'runner'],
  ['Deem', 'survey'],
  ['Dietz', 'workshop'],
  ['Eckhart', 'winch', 'lingerer'],
  ['Fenn', 'rigging'],
  ['Flores', 'drill'],
  ['Garrety', 'blasting'],
  ['Gould', 'quartermaster', 'pauser'],
  ['Halloran', 'infirmary'],
  ['Hatch', 'hull watch'],
  ['Ives', 'comms'],
  ['Jessup', 'drill', 'lingerer'],
  ['Keel', 'diving'],
  ['Kowalski', 'machinist'],
  ['Landry', 'galley'],
  ['Marsh', 'pile watch', undefined, 'slug'],
  ['Mercer', 'workshop'],
  ['Moss', 'rigging', 'runner'],
  ['Nagle', 'stores'],
  ['Odum', 'winch'],
  ['Pryor', 'survey'],
  ['Quill', 'comms', 'pauser'],
  ['Rademacher', 'drill'],
  ['Reyes', 'diving'],
  ['Sacks', 'infirmary'],
  ['Sloan', 'forward watch'],
  ['Tandy', 'fitter'],
  ['Ulrich', 'blasting', 'lingerer'],
  ['Vance', 'hull watch'],
  ['Weir', 'drill'],
  ['Whitlock', 'workshop'],
  ['Yates', 'boats'],
  ['Zeller', 'machinist'],
  ['Crane', 'fitter'],
  ['Dunbar', 'boats'],
  ['Early', 'mess'],
];

/** Deterministic PRNG (mulberry32) — same seed, same man, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the crew book. Exported as a function so tests can prove
 *  determinism (two builds must be deep-equal). */
export function buildCrew(): CrewProfile[] {
  const R = TUNING.roster;
  const carryWeight: Record<CarryItem, number> = {
    dryCell: R.weightDryCell,
    ammo: R.weightAmmo,
    slug: R.weightSlug,
  };
  return BOOK.map(([name, role, quirk, carry], index) => {
    const rigSeed = 1000 + index * 7919; // fixed offsets — identity, not chance
    const rng = mulberry32(rigSeed);
    const v = R.statVariance;
    return {
      index,
      name,
      role,
      weight: carry ? carryWeight[carry] : 1,
      speedMult: 1 + (rng() * 2 - 1) * v,
      hpMult: 1 + (rng() * 2 - 1) * v,
      rigSeed,
      voice: {
        sample: 1 + Math.floor(rng() * 3),
        rate: R.voiceRateMin + rng() * (R.voiceRateMax - R.voiceRateMin),
      },
      quirk,
      carry,
    };
  });
}

export const CREW: CrewProfile[] = buildCrew();

/**
 * The watch bill: who is on watch (in the world — alive, emerging, or still
 * drifting as a corpse), who is below, and how often each man walks.
 * Checkout = a man comes on watch; return = he goes below. The ZombieManager
 * calls these from spawn/remove so the one-of-each invariant holds by
 * construction.
 */
export class Roster {
  /** name → profile for every man currently in the world. */
  readonly onWatch = new Map<string, CrewProfile>();
  /** name → how many times he has come on watch this run (Lowe notices). */
  readonly watches = new Map<string, number>();
  /** Debug overrides: name → weight (0 removes him from the bill). */
  readonly weightOverrides = new Map<string, number>();

  private weightOf(p: CrewProfile): number {
    return this.weightOverrides.get(p.name) ?? p.weight;
  }

  /** Weighted pick over the men currently below. Null = the whole
   *  complement is on watch (the spawner waits). */
  checkout(rng: () => number = Math.random): CrewProfile | null {
    const below = CREW.filter((p) => !this.onWatch.has(p.name) && this.weightOf(p) > 0);
    if (below.length === 0) return null;
    let total = 0;
    for (const p of below) total += this.weightOf(p);
    let r = rng() * total;
    let pick = below[below.length - 1];
    for (const p of below) {
      r -= this.weightOf(p);
      if (r <= 0) {
        pick = p;
        break;
      }
    }
    return this.take(pick);
  }

  /** Debug: put a specific man on watch. Null = he's already out there. */
  checkoutByName(name: string): CrewProfile | null {
    const p = CREW.find((x) => x.name === name);
    if (!p || this.onWatch.has(name)) return null;
    return this.take(p);
  }

  private take(p: CrewProfile): CrewProfile {
    this.onWatch.set(p.name, p);
    this.watches.set(p.name, (this.watches.get(p.name) ?? 0) + 1);
    return p;
  }

  /** He goes below (despawn, recycle, or his body finally settling). */
  return(name: string): void {
    this.onWatch.delete(name);
  }

  /** How many watches a man has walked this run. */
  timesOnWatch(name: string): number {
    return this.watches.get(name) ?? 0;
  }
}
