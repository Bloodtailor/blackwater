// SHIFTS (M14 rewrite, DESIGN §9 — was kill-gated rounds):
//
//  • The clock is PURE TIME: a shift lasts shiftSec and advances no matter
//    what the player does. Kills change nothing. The shift bell rings on
//    every change (the director watches the number).
//  • Shift number scales the POPULATION CAP, not a spawn budget: the cave
//    fills toward mobCap(shift) continuously, in packs of 1..packMax.
//  • Intermissions and the Cave Stirs are DELETED — with no kill gate there
//    is no round to hold open, so the anti-crawler machinery has nothing to
//    guard (pillar 2, rewritten 2026-07-21).
//
// Pure logic, unit-tested; the ZombieManager owns burrow choice and bodies.
// HP/speed curves for the current shift live here too (same curves as the
// old rounds — the wall past lateRound stands).

import { TUNING } from '../tuning';

export interface ShiftEvents {
  /** A new shift just began (its number). Rings the bell + tally flicker.
   *  (Field name kept from the rounds era — specials/main listen to it.) */
  roundStarted?: number;
}

/** Drowned HP at a shift: ×1.12/shift through 20, ×1.18 after (the wall). */
export function roundHp(shift: number): number {
  const Z = TUNING.zombies;
  const early = Math.min(shift, Z.lateRound) - 1;
  const late = Math.max(0, shift - Z.lateRound);
  return Z.baseHp * Z.hpGrowth ** early * Z.hpGrowthLate ** late;
}

/** Drowned swim speed at a shift (capped below player sprint — escapable). */
export function roundSpeed(shift: number): number {
  const Z = TUNING.zombies;
  return Math.min(Z.baseSpeed + Z.speedPerRound * (shift - 1), Z.speedCap);
}

/** The population the cave sustains at a shift (DESIGN §9). */
export function mobCap(shift: number): number {
  const S = TUNING.shifts;
  if (shift <= 0) return 0;
  return Math.min(Math.floor(S.capBase + S.capPerShift * shift), S.hardCap);
}

export class ShiftSystem {
  /** Current shift. 0 = pre-game grace; shift 1 starts after the delay. */
  shift = 0;
  /** Seconds until the next bell. */
  shiftT: number = TUNING.shifts.firstShiftDelaySec;
  /** Debug: freeze the whole system (no clock, no spawns). */
  paused = false;

  private spawnCooldown = 0;

  /** Legacy alias — HUD, director, specials, and the ledger read `.round`. */
  get round(): number {
    return this.shift;
  }

  /** Jump straight to a shift (debug "start shift N", the hatch's +5 toll).
   *  Resets the clock so the arrival shift runs its full length. */
  startRound(n: number): ShiftEvents {
    this.shift = Math.max(1, Math.round(n));
    this.shiftT = TUNING.shifts.shiftSec;
    return { roundStarted: this.shift };
  }

  /** Advance the clock. Time is the only input — alive counts, kills, and
   *  the player's location are all irrelevant to the bell. */
  update(dt: number): ShiftEvents {
    if (this.paused) return {};
    this.spawnCooldown = Math.max(0, this.spawnCooldown - dt);
    this.shiftT -= dt;
    if (this.shiftT <= 0) return this.startRound(this.shift + 1);
    return {};
  }

  /**
   * Population spawner: how many bodies to place RIGHT NOW as one pack
   * (0 = none). The manager owns burrow choice and staggered emergence.
   */
  wantSpawnPack(alive: number): number {
    if (this.paused || this.shift <= 0 || this.spawnCooldown > 0) return 0;
    const room = mobCap(this.shift) - alive;
    if (room <= 0) return 0;
    this.spawnCooldown = TUNING.shifts.spawnCooldownSec;
    return Math.min(room, 1 + Math.floor(Math.random() * TUNING.shifts.packMax));
  }
}

/** Legacy export name — a few call sites still say RoundSystem. */
export { ShiftSystem as RoundSystem };
