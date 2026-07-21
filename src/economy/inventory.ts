// The belt (M13, DESIGN §10.3/§10.6): what the found-item economy carries —
// dynamite charges for debris chokes, tagged brass keys for grates, fuel
// slugs for the Bench. Pure logic; pickups.ts fills it, shops/pap consume it,
// the HUD reads it.
//
// BellIssue is the pacing device that replaced price: "ONE PULL PER MAN PER
// BELL" — a station issues once, then refuses until the shift bell has rung
// again (the bell number changes). Shared by lockers, shelves, the box, and
// PaP ammo.

export class Inventory {
  dynamite = 0;
  slugs = 0;
  /** door id (`a→b`) → the key's fiber-tag label. */
  keys = new Map<string, string>();
  onChange?: () => void;

  addDynamite(): void {
    this.dynamite++;
    this.onChange?.();
  }

  addKey(doorId: string, label: string): void {
    this.keys.set(doorId, label);
    this.onChange?.();
  }

  addSlug(): void {
    this.slugs++;
    this.onChange?.();
  }

  useDynamite(): boolean {
    if (this.dynamite <= 0) return false;
    this.dynamite--;
    this.onChange?.();
    return true;
  }

  hasKey(doorId: string): boolean {
    return this.keys.has(doorId);
  }

  /** The key stays on the ring after use (a used key is a story, not a
   *  resource) — grates check possession only. */
  useSlug(): boolean {
    if (this.slugs <= 0) return false;
    this.slugs--;
    this.onChange?.();
    return true;
  }
}

/** One issue per station per bell (shift). Bell number comes from the round
 *  counter until M14's shift clock replaces it — same semantics either way. */
export class BellIssue {
  private lastBell = Number.NEGATIVE_INFINITY;

  canIssue(bell: number): boolean {
    return bell !== this.lastBell;
  }

  issue(bell: number): boolean {
    if (!this.canIssue(bell)) return false;
    this.lastBell = bell;
    return true;
  }

  reset(): void {
    this.lastBell = Number.NEGATIVE_INFINITY;
  }
}
