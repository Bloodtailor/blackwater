// Draughts (DESIGN §10.5, LORE §4): 9 perks, pick 4 — the cap IS the identity
// system. Pure logic; effect numbers live in tuning.perks; the mods object is
// what every other system reads (vitals, weapons, atmosphere, silt, tilt).

import { TUNING } from '../tuning';
import type { PerkId } from '../cave/data';

export interface PerkInfo {
  name: string;
  cost: number;
  color: number; // canister cap color — the only saturated things down there
  blurb: string;
}

export const PERK_INFO: Record<PerkId, PerkInfo> = {
  barnacleHide: { name: 'BARNACLE HIDE', cost: TUNING.perks.barnacleHide.cost, color: 0x9c2f2f, blurb: 'thicker than you were' },
  secondWind: { name: 'SECOND WIND', cost: TUNING.perks.secondWind.cost, color: 0xd8c26a, blurb: 'one more surfacing' },
  greasedGears: { name: 'GREASED GEARS', cost: TUNING.perks.greasedGears.cost, color: 0xc06a28, blurb: 'the site keeps its lockers greased' },
  triggerFish: { name: 'TRIGGER FISH', cost: TUNING.perks.triggerFish.cost, color: 0xd8d24a, blurb: 'faster on the lever' },
  deepPockets: { name: 'DEEP POCKETS', cost: TUNING.perks.deepPockets.cost, color: 0x3f8f4f, blurb: 'a third hand' },
  ironLungs: { name: 'IRON LUNGS', cost: TUNING.perks.ironLungs.cost, color: 0x3fa0b8, blurb: 'the tank goes further' },
  catEyes: { name: 'CAT EYES', cost: TUNING.perks.catEyes.cost, color: 0x8f5fb8, blurb: 'the murk thins' },
  finKick: { name: 'FIN KICK', cost: TUNING.perks.finKick.cost, color: 0x3fb89a, blurb: 'water minds you less' },
  steadyHands: { name: 'STEADY HANDS', cost: TUNING.perks.steadyHands.cost, color: 0xc8c8c0, blurb: 'nothing stirs where you pass' },
};

export const ALL_PERKS = Object.keys(PERK_INFO) as PerkId[];

/** Everything perk effects touch, as multipliers/values with no-perk defaults.
 *  Systems read this each frame — buying or losing a perk applies instantly. */
export interface PerkMods {
  maxHp: number;
  airCap: number;
  drainMult: number;
  sprintDrainMult: number;
  speedMult: number;
  reloadMult: number;
  fireDelayMult: number;
  visMult: number;
  beamWidenMult: number;
  slots: number;
  noStir: boolean;
  tiltDecayMult: number;
}

export type BuyResult = 'ok' | 'owned' | 'capped' | 'poor';

export class Perks {
  readonly owned = new Set<PerkId>();
  private cached: PerkMods | null = null;

  get mods(): PerkMods {
    if (this.cached) return this.cached;
    const P = TUNING.perks;
    this.cached = {
      maxHp: this.owned.has('barnacleHide') ? P.barnacleHide.maxHp : TUNING.health.max,
      airCap: this.owned.has('ironLungs') ? P.ironLungs.airCap : TUNING.air.capacity,
      drainMult: this.owned.has('ironLungs') ? P.ironLungs.drainMult : 1,
      sprintDrainMult: this.owned.has('finKick') ? P.finKick.sprintDrainMult : 1,
      speedMult: this.owned.has('finKick') ? P.finKick.speedMult : 1,
      reloadMult: this.owned.has('greasedGears') ? P.greasedGears.reloadMult : 1,
      fireDelayMult: this.owned.has('triggerFish') ? P.triggerFish.fireDelayMult : 1,
      visMult: this.owned.has('catEyes') ? P.catEyes.visMult : 1,
      beamWidenMult: this.owned.has('catEyes') ? P.catEyes.beamWidenMult : 1,
      slots: this.owned.has('deepPockets') ? P.deepPockets.slots : 2,
      noStir: this.owned.has('steadyHands'),
      tiltDecayMult: this.owned.has('steadyHands') ? P.steadyHands.tiltDecayMult : 1,
    };
    return this.cached;
  }

  /** Can this perk be vended right now? (Affordability is the caller's check.) */
  vendState(id: PerkId): 'ok' | 'owned' | 'capped' {
    if (this.owned.has(id)) return 'owned';
    if (this.owned.size >= TUNING.perks.cap) return 'capped';
    return 'ok';
  }

  buy(id: PerkId): BuyResult {
    const s = this.vendState(id);
    if (s !== 'ok') return s;
    this.owned.add(id);
    this.cached = null;
    return 'ok';
  }

  /** Second Wind fires: the perk is spent (re-buyable, non-stackable). */
  consumeSecondWind(): void {
    this.owned.delete('secondWind');
    this.cached = null;
  }

  /** Debug. */
  giveAll(): void {
    // respects nothing — debug wants to test effects together
    for (const id of ALL_PERKS) this.owned.add(id);
    this.cached = null;
  }

  clear(): void {
    this.owned.clear();
    this.cached = null;
  }
}
