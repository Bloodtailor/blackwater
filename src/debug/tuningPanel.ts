// Every TUNING knob as an editable form (user 2026-07-19: tune from the level
// editor, carry the values into a playtest). Values write through
// setTuningValue, so they apply live AND persist in localStorage across
// editor ⇄ game switches.
//
// 2026-07-20 (user): every knob now shows a DESCRIPTION (hover) parsed from
// tuning.ts's own trailing comments — the source comment IS the doc, no
// second list to drift — and 💾 SAVE TO DISK commits the current values to
// src/tuning.overrides.json through the dev server, making them the new
// stock numbers for every browser and every future session.

import {
  bakeTuningDefaults,
  clearTuningOverrides,
  diskTuningOverrides,
  getTuningDefault,
  getTuningValue,
  listTuningPaths,
  setTuningValue,
  tuningOverrideCount,
} from '../tuning';
import tuningSource from '../tuning.ts?raw';

/** dotted path → the trailing `// comment` on its line in tuning.ts. */
function parseDescriptions(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const stack: string[] = [];
  for (const line of src.split('\n')) {
    const open = line.match(/^\s*(?:'([^']+)'|([A-Za-z_][\w]*))\s*:\s*\{/);
    if (open && !/\}/.test(line.slice(line.indexOf('{') + 1))) {
      stack.push(open[1] ?? open[2]);
      continue;
    }
    if (/^\s*\}/.test(line)) {
      stack.pop();
      continue;
    }
    const kv = line.match(/^\s*(?:'([^']+)'|([A-Za-z_][\w]*))\s*:\s*[^/]+\/\/\s*(.+)$/);
    if (kv && stack.length) map.set([...stack, kv[1] ?? kv[2]].join('.'), kv[3].trim());
  }
  return map;
}

const DESCRIPTIONS = parseDescriptions(tuningSource);

// Repeating stat families (weapons/specials share leaf names) — one precise
// description each, instead of 90 identical comments in tuning.ts. An exact
// trailing comment on the source line always wins over these.
const LEAF_DESCRIPTIONS: Record<string, string> = {
  damage: 'damage per hit (per pellet/ray for multi-projectile guns)',
  fireDelaySec: 'seconds between shots (1 ÷ fire rate)',
  magSize: 'rounds per magazine',
  reserveMax: 'max reserve ammo carried',
  reloadSec: 'full reload time in seconds',
  rangeM: 'max hit distance in meters',
  headshotMult: 'damage multiplier on headshots',
  cost: 'price in points',
  killPoints: 'points awarded for killing this enemy',
  hp: 'hit points',
  speed: 'movement speed m/s',
  grabCooldownSec: 'seconds between this enemy’s attacks',
  stabRangeM: 'melee sweep reach in meters',
  stabPierce: 'bodies one stab can hit',
  pellets: 'projectiles per trigger pull',
  spreadDeg: 'random spread half-angle in degrees',
  burst: 'rays per trigger pull (burst weapons)',
  burstSpreadDeg: 'degrees between burst rays',
  pierce: 'bodies one ray passes through',
  tracerLifeSec: 'tracer visual lifetime in seconds',
  chainCount: 'extra bodies the arc chains to',
  chainRadiusM: 'max meters between chain links',
  chainFalloff: 'damage multiplier per chain hop',
  vortexRadiusM: 'pull radius around the impact point',
  vortexPullSec: 'seconds bodies are dragged to the point',
  sinkhole: 'value for the Sinkhole zone',
  galleries: 'value for the Galleries zone',
  maze: 'value for the Maze zone',
  throat: 'value for the Throat zone',
  abyss: 'value for the Abyss zone',
};

// Knobs that live inside single-line object literals in tuning.ts, where a
// trailing comment can't attach to the individual value.
const PATH_DESCRIPTIONS: Record<string, string> = {
  'rounds.caveStirs.minRemaining': 'countdown arms at ≤ max(this, fraction × round total)',
  'rounds.caveStirs.fraction': '…or this fraction of the round total, whichever is larger',
  'rounds.caveStirs.maxRemaining': 'cap on the armed threshold',
  'rounds.caveStirs.countdownSec': 'visible countdown before the next round forces in',
  'perks.barnacleHide.maxHp': 'max HP with Barnacle Hide',
  'perks.secondWind.blackoutSec': 'blackout length before waking at the pocket (s)',
  'perks.greasedGears.reloadMult': 'reload time multiplier',
  'perks.triggerFish.fireDelayMult': 'fire-delay multiplier (lower = faster)',
  'perks.deepPockets.slots': 'weapon slots with Deep Pockets',
  'perks.ironLungs.airCap': 'air capacity with Iron Lungs',
  'perks.ironLungs.drainMult': 'air-drain multiplier',
  'perks.catEyes.visMult': 'visibility multiplier in silt/dark',
  'perks.catEyes.beamWidenMult': 'flashlight beam width multiplier',
  'perks.finKick.speedMult': 'swim speed multiplier',
  'perks.finKick.sprintDrainMult': 'sprint air-cost multiplier',
  'perks.steadyHands.tiltDecayMult': 'tilt decay-rate multiplier',
  'specials.biolum.count': 'bioluminescent points seeded in the Cathedral',
  'specials.biolum.sizeM': 'biolum point sprite size (m)',
};

function describe(path: string): string | undefined {
  const exact = DESCRIPTIONS.get(path) ?? PATH_DESCRIPTIONS[path];
  if (exact) return exact;
  if (path.startsWith('drops.weights.')) return 'relative roll weight in the drop table';
  if (path.startsWith('economy.gunCost.')) return 'wall-buy price in points (ammo refill = half price)';
  return LEAF_DESCRIPTIONS[path.split('.').pop() ?? ''];
}

export function buildTuningUI(parent: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'tuning-ui';
  parent.appendChild(wrap);

  const head = document.createElement('div');
  head.className = 'tuning-head';
  const count = document.createElement('span');
  const setCount = (msg?: string): void => {
    const n = tuningOverrideCount();
    count.textContent = msg ?? (n ? `${n} unsaved change(s)` : 'all values stock');
  };
  setCount();
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾 save to disk';
  saveBtn.title = 'Commit every changed value to src/tuning.overrides.json — they become the stock numbers for all browsers and future sessions (dev server only).';
  const reset = document.createElement('button');
  reset.textContent = 'reset all';
  reset.title = 'Discard unsaved changes (values saved to disk stay).';
  head.append(count, saveBtn, reset);
  wrap.appendChild(head);

  const groups = new Map<string, HTMLElement>();
  const inputs = new Map<string, HTMLInputElement>();
  const repaintAll = (): void => {
    for (const [path, input] of inputs) {
      input.value = String(getTuningValue(path));
      input.parentElement?.classList.toggle('tuned', getTuningValue(path) !== getTuningDefault(path));
    }
  };

  const groupBody = (name: string): HTMLElement => {
    let body = groups.get(name);
    if (!body) {
      const det = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = name;
      det.appendChild(sum);
      body = document.createElement('div');
      det.appendChild(body);
      wrap.appendChild(det);
      groups.set(name, body);
    }
    return body;
  };

  for (const path of listTuningPaths()) {
    const dot = path.indexOf('.');
    const group = dot < 0 ? '(root)' : path.slice(0, dot);
    const leaf = dot < 0 ? path : path.slice(dot + 1);
    const row = document.createElement('label');
    row.className = 'tuning-row';
    const span = document.createElement('span');
    span.textContent = leaf;
    // the description IS tuning.ts's trailing comment for this knob
    // (family leaves fall back to the shared dictionary above)
    const desc = describe(path);
    row.title = desc ? `${path}\n${desc}` : path;
    if (desc) span.classList.add('has-desc');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    const paint = (): void => {
      input.value = String(getTuningValue(path));
      row.classList.toggle('tuned', getTuningValue(path) !== getTuningDefault(path));
    };
    paint();
    input.addEventListener('change', () => {
      setTuningValue(path, input.value === '' ? undefined : Number(input.value));
      paint();
      setCount();
    });
    inputs.set(path, input);
    row.append(span, input);
    groupBody(group).appendChild(row);
  }

  saveBtn.addEventListener('click', () => {
    // merged disk layer: everything already committed + this session's diffs
    const merged = diskTuningOverrides();
    for (const path of listTuningPaths()) {
      const v = getTuningValue(path);
      if (v !== getTuningDefault(path)) merged[path] = v;
    }
    void fetch('/__tuning', { method: 'POST', body: JSON.stringify(merged) })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        bakeTuningDefaults();
        repaintAll();
        setCount(`saved ${Object.keys(merged).length} value(s) to disk ✓`);
      })
      .catch(() => setCount('SAVE FAILED (dev server only)'));
  });

  reset.addEventListener('click', () => {
    clearTuningOverrides();
    repaintAll();
    setCount();
  });
}
