// Round system (DESIGN §9) — pure logic, no three dependency (unit-testable).
//
//  • Round N spawns 6+4N Drowned (cap 60), max 9 alive.
//  • Kill all → 40 s intermission ON A GLOBAL TIMER → next round starts
//    wherever the player is. No "take a break when ready."
//  • THE CAVE STIRS (the user's anti-crawler rule): when a round's remaining
//    zombies drop to ≤ max(3, 15% of the round total) capped at 10, a visible
//    45 s countdown starts — when it expires the next round begins REGARDLESS.
//    Survivors carry over (they count against the alive cap). A round cannot
//    be held open; there is no keepable crawler by rule.
//
// The manager polls wantSpawn(alive) for pacing and reports kills/alive back
// through update(). HP/speed curves for the current round live here too.

import { TUNING } from '../tuning';

export type RoundPhase = 'intermission' | 'active';

export interface RoundEvents {
  /** A new round just began (its number). Triggers the tally stinger. */
  roundStarted?: number;
  /** The Cave Stirs countdown just began. */
  caveStirsStarted?: boolean;
}

/** Zombies a round spawns in total. */
export function roundCount(round: number): number {
  const R = TUNING.rounds;
  return Math.min(R.baseCount + R.perRound * round, R.countCap);
}

/** Drowned HP at a round: ×1.12/round through 20, ×1.18 after (the wall). */
export function roundHp(round: number): number {
  const Z = TUNING.zombies;
  const early = Math.min(round, Z.lateRound) - 1;
  const late = Math.max(0, round - Z.lateRound);
  return Z.baseHp * Z.hpGrowth ** early * Z.hpGrowthLate ** late;
}

/** Drowned swim speed at a round (capped below player sprint — always escapable). */
export function roundSpeed(round: number): number {
  const Z = TUNING.zombies;
  return Math.min(Z.baseSpeed + Z.speedPerRound * (round - 1), Z.speedCap);
}

/** The Cave Stirs threshold for a round total: max(min, 15%) capped. */
export function caveStirsThreshold(total: number): number {
  const C = TUNING.rounds.caveStirs;
  return Math.min(Math.max(C.minRemaining, Math.round(C.fraction * total)), C.maxRemaining);
}

export class RoundSystem {
  round = 0; // 0 = pre-game grace; round 1 starts after firstRoundDelaySec
  phase: RoundPhase = 'intermission';
  /** Zombies still unspawned this round. */
  toSpawn = 0;
  /** Seconds left in the intermission (phase 'intermission'). */
  intermissionT: number = TUNING.rounds.firstRoundDelaySec;
  /** Cave Stirs countdown, seconds left; negative = not running. */
  stirsT = -1;
  /** Debug: freeze the whole system (no timers, no spawns). */
  paused = false;

  private spawnT = 0;

  /** Total zombies this round spawns (constant per round). */
  get roundTotal(): number {
    return roundCount(this.round);
  }

  get caveStirsActive(): boolean {
    return this.stirsT >= 0;
  }

  /** Jump straight to a round (debug "start round N"). */
  startRound(n: number): RoundEvents {
    this.round = n;
    this.phase = 'active';
    this.toSpawn = roundCount(n);
    this.stirsT = -1;
    this.spawnT = 0;
    return { roundStarted: n };
  }

  /**
   * Advance timers. `alive` is the live zombie count (survivors included —
   * they carry over and count against the cap by construction).
   */
  update(dt: number, alive: number): RoundEvents {
    if (this.paused) return {};
    this.spawnT = Math.max(0, this.spawnT - dt);

    if (this.phase === 'intermission') {
      this.intermissionT -= dt;
      if (this.intermissionT <= 0) return this.startRound(this.round + 1);
      return {};
    }

    // active
    const remaining = this.toSpawn + alive;
    if (remaining === 0) {
      this.phase = 'intermission';
      this.intermissionT = TUNING.rounds.intermissionSec;
      this.stirsT = -1;
      return {};
    }
    if (this.stirsT < 0 && remaining <= caveStirsThreshold(this.roundTotal)) {
      this.stirsT = TUNING.rounds.caveStirs.countdownSec;
      return { caveStirsStarted: true };
    }
    if (this.stirsT >= 0) {
      this.stirsT -= dt;
      if (this.stirsT <= 0) return this.startRound(this.round + 1); // regardless
    }
    return {};
  }

  /** Manager polls this once per frame; true = spawn one zombie now. */
  wantSpawn(alive: number): boolean {
    if (this.paused || this.phase !== 'active' || this.toSpawn <= 0) return false;
    if (alive >= TUNING.rounds.aliveCap || this.spawnT > 0) return false;
    const R = TUNING.rounds;
    this.spawnT = Math.max(R.spawnEveryMinSec, R.spawnEverySec - R.spawnAccelPerRound * (this.round - 1));
    this.toSpawn--;
    return true;
  }
}
