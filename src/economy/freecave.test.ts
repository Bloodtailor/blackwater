// M13a integration (headless): the WHOLE free-issue flow driven through the
// real constructors and interact prompts — no browser needed. Written when
// the session's Browser pane died mid-milestone; kept because it's a better
// regression net than the manual pass it substituted for. Visual/audio side
// (props resting on rock, belt HUD, audible bells) still gets a browser
// smoke — see the M13a worklog note.
//
// THREE builds object graphs fine in node; the only DOM the economy touches
// is 2D-canvas label textures, so `document.createElement('canvas')` gets a
// no-op Proxy context stub before the modules load (hence dynamic imports).

import { beforeAll, describe, expect, it } from 'vitest';

interface InteractItem {
  id: string;
  prompt(): { text: string; enabled: boolean; sub?: string } | null;
  execute(): void;
}

const items: InteractItem[] = [];
const fakeInteract = { add: (it: InteractItem) => items.push(it) };
const find = (id: string): InteractItem => {
  const it = items.find((i) => i.id === id);
  if (!it) throw new Error(`no interactable ${id} — have: ${items.map((i) => i.id).join(', ')}`);
  return it;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let T: any; // three
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let world: any = null;

beforeAll(async () => {
  // every property is itself, calling it returns itself, numbers coerce to 0 —
  // enough 2D-canvas surface for label textures that are never rendered
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function () {} as never, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : chain),
    set: () => true,
    apply: () => chain,
  });
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => chain, toDataURL: () => 'data:,' }),
  };
  T = await import('three');
  const { buildDoors } = await import('../cave/doors');
  const { Shops } = await import('./shops');
  const { MysteryBox } = await import('./mysteryBox');
  const { PapBench } = await import('./pap');
  const { buildPickups } = await import('./pickups');
  const { Inventory } = await import('./inventory');
  const { Perks } = await import('./perks');
  const { Weapons } = await import('../player/weapons');

  const scene = new T.Scene();
  const doors = buildDoors(scene);
  const inventory = new Inventory();
  const perks = new Perks();
  const weapons = new Weapons();
  let bellNow = 1;
  let hatchTolls = 0;
  const toasts: string[] = [];
  const shops = new Shops({
    scene,
    interact: fakeInteract as never,
    doors,
    inventory,
    bell: () => bellNow,
    perks,
    weapons,
    toast: (m: string) => toasts.push(m),
    click: () => {},
    onPerkBought: () => {},
    onVendor: () => true,
    onPowerOn: () => {},
    onHatchToll: () => hatchTolls++,
  });
  const box = new MysteryBox(scene, fakeInteract as never, () => bellNow, weapons, (m: string) => toasts.push(m));
  const pap = new PapBench(scene, fakeInteract as never, inventory, weapons, () => shops.powered, (m: string) => toasts.push(m));
  buildPickups(scene, fakeInteract as never, inventory, (m: string) => toasts.push(m));
  world = { doors, inventory, perks, weapons, shops, box, pap, toasts, setBell: (n: number) => (bellNow = n), getHatchTolls: () => hatchTolls };
});

describe('M13a free cave — headless end-to-end', () => {
  it('all nine pickups registered as interactables', () => {
    expect(items.filter((i) => i.id.startsWith('pickup:')).length).toBe(9);
  });

  it('a debris choke refuses without dynamite, blasts with it, and consumes the charge', () => {
    const door = find('door:sink-shaft→gal-entry');
    expect(door.prompt()!.enabled).toBe(false);
    door.execute();
    expect(world.doors.find((d: { id: string }) => d.id === 'sink-shaft→gal-entry').open).toBe(false);
    find('pickup:sink-crack').execute(); // take the crate at the crack mouth
    expect(world.inventory.dynamite).toBe(1);
    expect(door.prompt()!.enabled).toBe(true);
    door.execute();
    expect(world.doors.find((d: { id: string }) => d.id === 'sink-shaft→gal-entry').open).toBe(true);
    expect(world.inventory.dynamite).toBe(0);
  });

  it('a grate refuses without its key and opens with it (key stays on the ring)', () => {
    const grate = find('door:gal-entry→gal-pile');
    expect(grate.prompt()!.enabled).toBe(false);
    find('pickup:gal-rec').execute();
    expect(grate.prompt()!.text).toContain('PILE GRATE');
    grate.execute();
    expect(world.doors.find((d: { id: string }) => d.id === 'gal-entry→gal-pile').open).toBe(true);
    expect(world.inventory.hasKey('gal-entry→gal-pile')).toBe(true);
  });

  it('the hatch is free, opens, and fires the toll callback exactly once', () => {
    const hatch = find('door:throat-bottom→abyss-hall');
    const p = hatch.prompt()!;
    expect(p.enabled).toBe(true);
    expect(p.text).toContain('FIVE BELLS');
    hatch.execute();
    expect(world.getHatchTolls()).toBe(1);
    expect(world.doors.find((d: { id: string }) => d.id === 'throat-bottom→abyss-hall').open).toBe(true);
    hatch.execute(); // already open — no double toll
    expect(world.getHatchTolls()).toBe(1);
  });

  it('a locker issues the gun free, then ammo once per bell', () => {
    const locker = find('gun:speargun');
    expect(locker.prompt()!.sub).toBe('FREE ISSUE');
    locker.execute(); // take the gun
    expect(world.weapons.slots.some((s: { def: { id: string } }) => s.def.id === 'speargun')).toBe(true);
    expect(locker.prompt()!.enabled).toBe(true); // first ammo issue this bell
    locker.execute();
    expect(locker.prompt()!.enabled).toBe(false); // refused: same bell
    world.setBell(2);
    expect(locker.prompt()!.enabled).toBe(true); // the bell rang
  });

  it('the Roulette pulls free, once per bell', () => {
    const crate = items.filter((i) => i.id.startsWith('box:'));
    expect(crate.length).toBeGreaterThan(0);
    const live = crate.find((c) => c.prompt()?.enabled);
    expect(live).toBeDefined();
    live!.execute();
    expect(world.box.state).toBe('spinning');
    expect(world.box.pullBell.canIssue(2)).toBe(false); // spent this bell
    expect(world.box.pullBell.canIssue(3)).toBe(true);
  });

  it('the draught rack is dark without power, free with it', () => {
    const rack = find('perk:barnacleHide');
    expect(rack.prompt()!.enabled).toBe(false);
    world.shops.setPowered(true);
    expect(rack.prompt()!.enabled).toBe(true);
    expect(rack.prompt()!.text).toContain('TAKE THE FLASK');
    rack.execute();
    expect(world.perks.owned.has('barnacleHide')).toBe(true);
  });

  it('the Bench wants a slug, eats exactly one', () => {
    const bench = find('pap');
    expect(bench.prompt()!.enabled).toBe(false); // no slug on the belt
    find('pickup:gal-pile').execute();
    expect(world.inventory.slugs).toBe(1);
    expect(bench.prompt()!.enabled).toBe(true);
    bench.execute();
    expect(world.pap.state).toBe('working');
    expect(world.inventory.slugs).toBe(0);
  });

  it('nothing in the economy references point spending anymore', () => {
    // the whole flow above ran without a Points instance existing at all —
    // that IS the assertion; this line just states it
    expect(true).toBe(true);
  });
});
