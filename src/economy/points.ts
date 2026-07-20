// Points (DESIGN §10): 10/hit, 60/kill, 100/headshot kill, 130/melee kill.
// Pure logic; M6 builds the spending side (doors, buys, box, perks) on this.

import { TUNING } from '../tuning';

export class Points {
  balance: number = TUNING.economy.startPoints;
  /** Double Points drop: earnings multiplier (spending is never multiplied). */
  multiplier = 1;
  /** HUD hook: balance + the delta that just landed (for the +tick). */
  onChange?: (balance: number, delta: number) => void;

  award(n: number): void {
    const amt = Math.round(n * this.multiplier);
    this.balance += amt;
    this.onChange?.(this.balance, amt);
  }

  canAfford(n: number): boolean {
    return this.balance >= n;
  }

  spend(n: number): boolean {
    if (!this.canAfford(n)) return false;
    this.balance -= n;
    this.onChange?.(this.balance, -n);
    return true;
  }
}
