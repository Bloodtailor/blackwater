// Editor side panel: toolbar, property forms for the selection, zone-hub
// pickers, and the live DESIGN §5 rule checks. Pure DOM — the 3D side lives
// in editor.ts and calls refresh()/refreshLive()/toast().

import { EDGES, NODES, ZONE_HUBS, getNode, type CaveEdge, type CaveNode, type NodeTag, type Zone } from '../cave/data';
import { runChecks } from '../cave/validate';
import { buildTuningUI } from '../debug/tuningPanel';
import { IS_DEV } from '../util/persist';
import type { Selection } from './editor';

export interface PanelApi {
  getSelection(): Selection;
  select(sel: Selection): void;
  commit(): void;
  undo(): void;
  save(): void;
  download(): void;
  frame(): void;
  addRoom(): void;
  deleteSelection(): void;
  duplicateNode(): void;
  renameNode(oldId: string, newId: string): boolean;
  addAudioNode(): void;
  setFilter(tag: string): void;
  getFilter(): string;
  toggleTeasers(): boolean;
  toggleAudio(): boolean;
  toggleTunnels(): boolean;
  previewRock(): void;
  hideRock(): void;
  toggleLabels(): void;
  toggleMarkers(): void;
  toggleOrient(): void;
  toggleWater(): void;
  waypointToRoom(): void;
  playtest(): void;
  /** ⬆ JSON — read a downloaded layout back in (web-deploy §2). */
  load(): void;
  /** Drop the browser-saved draft so the shipped map loads again. */
  discardDraft(): void;
}

export interface Panel {
  refresh(): void;
  refreshLive(): void;
  toast(msg: string): void;
}

const ALL_TAGS: NodeTag[] = [
  'airPocket', 'ambushPocket', 'burrow', 'landmark', 'siltyFloor', 'chalkMound', 'perk', 'wallBuy', 'boxSpot',
  'power', 'pap', 'heart', 'tape', 'cache', 'tieOff', 'poster', 'toy', 'jukebox', 'guardianPost', 'surface',
];
const ZONES: Zone[] = ['sinkhole', 'galleries', 'maze', 'throat', 'abyss'];

export function buildPanel(api: PanelApi): Panel {
  const root = document.createElement('div');
  root.id = 'editor-panel';
  document.body.appendChild(root);

  const toastEl = document.createElement('div');
  toastEl.id = 'editor-toast';
  document.body.appendChild(toastEl);
  let toastTimer: number | null = null;
  const toast = (msg: string): void => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
  };

  // ── toolbar ──
  const bar = document.createElement('div');
  bar.className = 'ed-toolbar';
  root.appendChild(bar);
  const btn = (label: string, fn: () => void, cls = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.addEventListener('click', fn);
    bar.appendChild(b);
    return b;
  };
  btn('💾 SAVE', () => api.save(), 'ed-primary');
  btn('▶ TEST', () => api.playtest(), 'ed-primary');
  btn('▶ saved', () => (location.search = '?debug=1'));
  btn('+ ROOM', () => api.addRoom());
  btn('+ ♪', () => api.addAudioNode()).title = 'Add an AUDIO node: a pure sound emitter (machinery/airflow behind the walls). No geometry — bury it in rock.';
  btn('⛰ ROCK', () => api.previewRock());
  btn('⛰ off', () => api.hideRock());
  btn('↩ UNDO', () => api.undo());
  // Static build: SAVE keeps the map in this browser, so there has to be a way
  // to throw that away and get the shipped cave back (web-deploy §2).
  if (!IS_DEV) {
    btn('🗑 draft', () => api.discardDraft()).title = 'Discard the map saved in this browser and go back to the shipped one';
  }
  btn('⬇ JSON', () => api.download()).title = 'Download this layout as a real layout.json file';
  btn('⬆ JSON', () => api.load()).title = 'Load a layout.json file back in (a downloaded map, or the shipped one)';
  btn('🏷', () => api.toggleLabels());
  btn('🧭', () => api.toggleMarkers());
  const ghostBtn = btn('👻', () => {
    ghostBtn.classList.toggle('ed-on', api.toggleTeasers());
  });
  ghostBtn.title = 'Show/hide TEASER rooms (visible-but-unreachable dressing; outside all rule checks)';
  const audioBtn = btn('♪', () => {
    audioBtn.classList.toggle('ed-on', api.toggleAudio());
  });
  audioBtn.title = 'Show/hide AUDIO nodes (hidden by default — they clutter level work)';
  const tunnelBtn = btn('⬭', () => {
    tunnelBtn.classList.toggle('ed-on', api.toggleTunnels());
  });
  tunnelBtn.title = 'TUNNEL VIEW (M13b): draw every tunnel at its real width-class radius, with door/gate rings at their true positions';

  // ── node-type filter (user 2026-07-20: "just see all boxSpots") ──
  const filterRow = document.createElement('div');
  filterRow.className = 'ed-filter';
  const fLabel = document.createElement('span');
  fLabel.textContent = 'FILTER ';
  filterRow.appendChild(fLabel);
  const fSel = document.createElement('select');
  for (const o of ['all', ...ALL_TAGS, 'teaser', 'audio']) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    fSel.appendChild(opt);
  }
  fSel.value = api.getFilter();
  fSel.addEventListener('change', () => api.setFilter(fSel.value));
  filterRow.appendChild(fSel);
  root.appendChild(filterRow);

  const hint = document.createElement('div');
  hint.className = 'ed-hint';
  hint.textContent =
    'click select · drag gizmo · R orient (tilt falseUp+water) · W water level (drag the arrow) · shift-click 2nd room = tunnel · dbl-click tunnel = waypoint · DEL delete · F frame · ctrl+Z undo · 🧭 markers · TEST plays the UNSAVED layout in noclip, F4 in game returns here';
  root.appendChild(hint);

  const form = document.createElement('div');
  form.className = 'ed-form';
  root.appendChild(form);

  const checksEl = document.createElement('div');
  checksEl.className = 'ed-checks';
  root.appendChild(checksEl);

  // every TUNING knob, editable here; values persist and ride into ▶ TEST
  const tuningDet = document.createElement('details');
  tuningDet.className = 'ed-tuning';
  const tuningSum = document.createElement('summary');
  tuningSum.className = 'ed-title';
  tuningSum.textContent = 'TUNING KNOBS';
  tuningDet.appendChild(tuningSum);
  buildTuningUI(tuningDet);
  root.appendChild(tuningDet);

  // ── field helpers ──
  const row = (parent: HTMLElement, label: string): HTMLElement => {
    const r = document.createElement('label');
    r.className = 'ed-row';
    const s = document.createElement('span');
    s.textContent = label;
    r.appendChild(s);
    parent.appendChild(r);
    return r;
  };
  const numField = (
    parent: HTMLElement,
    label: string,
    get: () => number | undefined,
    set: (v: number | undefined) => void,
    step = 0.5,
  ): HTMLInputElement => {
    const r = row(parent, label);
    const i = document.createElement('input');
    i.type = 'number';
    i.step = String(step);
    const v = get();
    i.value = v === undefined ? '' : String(Math.round(v * 100) / 100);
    i.addEventListener('change', () => {
      set(i.value === '' ? undefined : Number(i.value));
      api.commit();
    });
    r.appendChild(i);
    return i;
  };
  const vecField = (
    parent: HTMLElement,
    label: string,
    get: () => [number, number, number] | undefined,
    set: (v: [number, number, number] | undefined) => void,
  ): HTMLInputElement[] => {
    const r = row(parent, label);
    const inputs: HTMLInputElement[] = [];
    for (let k = 0; k < 3; k++) {
      const i = document.createElement('input');
      i.type = 'number';
      i.step = '0.5';
      i.className = 'ed-vec';
      const v = get();
      i.value = v === undefined ? '' : String(Math.round(v[k] * 100) / 100);
      i.addEventListener('change', () => {
        if (inputs.every((x) => x.value === '')) {
          set(undefined);
        } else {
          set([Number(inputs[0].value) || 0, Number(inputs[1].value) || 0, Number(inputs[2].value) || 0]);
        }
        api.commit();
      });
      r.appendChild(i);
      inputs.push(i);
    }
    return inputs;
  };
  const boolField = (parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void): void => {
    const r = row(parent, label);
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = get();
    i.addEventListener('change', () => {
      set(i.checked);
      api.commit();
    });
    r.appendChild(i);
  };
  const selectField = (parent: HTMLElement, label: string, options: string[], get: () => string, set: (v: string) => void): void => {
    const r = row(parent, label);
    const s = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      s.appendChild(opt);
    }
    s.value = get();
    s.addEventListener('change', () => {
      set(s.value);
      api.commit();
    });
    r.appendChild(s);
  };

  let posInputs: HTMLInputElement[] = [];

  // Known loopable samples (public/audio/sfx) for the audio-node picker;
  // free text still allowed — the game falls back to a synth drone for
  // unknown names, so a typo hums instead of crashing.
  const SAMPLE_SUGGESTIONS = ['amb-machinery', 'amb-airflow', 'amb-groan', 'amb-drips', 'ambient-shallow', 'ambient-mid', 'ambient-deep', 'angler-hum', 'guardian-presence', 'toy-shimmer'];
  const dataList = document.createElement('datalist');
  dataList.id = 'bw-sample-list';
  for (const s of SAMPLE_SUGGESTIONS) {
    const o = document.createElement('option');
    o.value = s;
    dataList.appendChild(o);
  }
  root.appendChild(dataList);

  const audioFields = (n: CaveNode): void => {
    const a = (n.audio = n.audio ?? { sample: 'amb-machinery', radiusM: 15, falloff: 3 });
    const r = row(form, 'sample');
    const i = document.createElement('input');
    i.value = a.sample;
    i.setAttribute('list', 'bw-sample-list');
    i.addEventListener('change', () => {
      a.sample = i.value.trim();
      api.commit();
    });
    r.appendChild(i);
    numField(form, 'radiusM (audible range)', () => a.radiusM, (v) => (a.radiusM = v ?? a.radiusM), 1);
    numField(form, 'falloff (higher = tighter)', () => a.falloff, (v) => (a.falloff = v ?? undefined), 0.5);
    // zone SHAPE, exactly like rooms (user 2026-07-20): the audible zone is
    // radiusM stretched per-axis — squash it flat along a corridor, etc.
    vecField(form, 'stretch (zone shape)', () => n.stretch, (v) => (n.stretch = v ?? undefined));
    const note = document.createElement('div');
    note.className = 'ed-note';
    note.textContent = 'Outer shell = audible limit (radiusM × stretch), inner shell = falloff knee (÷ falloff). Rock between player and node muffles it honestly (SDF occlusion).';
    form.appendChild(note);
  };

  const audioNodeForm = (n: CaveNode): void => {
    const h = document.createElement('div');
    h.className = 'ed-title';
    h.textContent = `♪ AUDIO NODE · ${n.id}`;
    form.appendChild(h);
    const r = row(form, 'id');
    const idInput = document.createElement('input');
    idInput.value = n.id;
    idInput.addEventListener('change', () => {
      if (!api.renameNode(n.id, idInput.value.trim())) {
        toast('RENAME FAILED (empty or taken)');
        idInput.value = n.id;
      }
    });
    r.appendChild(idInput);
    selectField(form, 'zone', ZONES, () => n.zone, (v) => (n.zone = v as Zone));
    posInputs = vecField(form, 'pos', () => n.pos, (v) => (n.pos = v ?? n.pos));
    audioFields(n);
    const acts = document.createElement('div');
    acts.className = 'ed-actions';
    for (const [label, fn] of [
      ['⌖ frame', api.frame],
      ['⧉ duplicate', api.duplicateNode],
      ['✕ delete', api.deleteSelection],
    ] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', fn);
      acts.appendChild(b);
    }
    form.appendChild(acts);
  };

  const nodeForm = (n: CaveNode): void => {
    if (n.kind === 'audio') {
      audioNodeForm(n);
      return;
    }
    const h = document.createElement('div');
    h.className = 'ed-title';
    h.textContent = `ROOM · ${n.id}`;
    form.appendChild(h);
    // id rename
    const r = row(form, 'id');
    const idInput = document.createElement('input');
    idInput.value = n.id;
    idInput.addEventListener('change', () => {
      if (!api.renameNode(n.id, idInput.value.trim())) {
        toast('RENAME FAILED (empty or taken)');
        idInput.value = n.id;
      }
    });
    r.appendChild(idInput);
    selectField(form, 'zone', ZONES, () => n.zone, (v) => (n.zone = v as Zone));
    posInputs = vecField(form, 'pos', () => n.pos, (v) => (n.pos = v ?? n.pos));
    numField(form, 'radius', () => n.radius, (v) => (n.radius = v ?? n.radius), 0.25);
    vecField(form, 'stretch', () => n.stretch, (v) => (n.stretch = v ?? undefined));
    numField(form, 'pillars', () => n.pillars, (v) => (n.pillars = v), 1);
    numField(form, 'spikes', () => n.spikes, (v) => (n.spikes = v), 1);
    numField(form, 'floor 0..1', () => n.floor, (v) => (n.floor = v), 0.05);
    boolField(form, 'dry (air)', () => !!n.dry, (v) => (n.dry = v || undefined));
    numField(form, 'water 0..1', () => n.water, (v) => (n.water = v), 0.05);
    vecField(form, 'falseUp', () => n.falseUp, (v) => (n.falseUp = v ?? undefined));
    // teaser: visible-but-unreachable dressing — outside every rule check,
    // hidden in the editor by default (👻 toggles)
    boolField(form, 'teaser (dressing)', () => !!n.teaser, (v) => (n.teaser = v || undefined));
    // tags
    const tagBox = document.createElement('div');
    tagBox.className = 'ed-tags';
    for (const t of ALL_TAGS) {
      const l = document.createElement('label');
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = n.tags.includes(t);
      c.addEventListener('change', () => {
        if (c.checked) n.tags.push(t);
        else n.tags.splice(n.tags.indexOf(t), 1);
        api.commit();
      });
      l.appendChild(c);
      l.appendChild(document.createTextNode(t));
      tagBox.appendChild(l);
    }
    form.appendChild(tagBox);
    // ── M13b pickup placement (DESIGN §10.3/§10.6): the found-item economy
    // is authored here — dynamite blasts debris, a key cuts its tagged
    // grate, a slug feeds the Bench ──
    selectField(form, 'pickup', ['none', 'dynamite', 'key', 'slug'], () => n.contents?.pickup?.kind ?? 'none', (v) => {
      if (v === 'none') {
        if (n.contents?.pickup) delete n.contents.pickup;
      } else {
        const grates = EDGES.filter((e) => e.door?.kind === 'grate').map((e) => `${e.a}→${e.b}`);
        n.contents = {
          ...(n.contents ?? {}),
          pickup:
            v === 'key'
              ? { kind: 'key', keyFor: grates[0] ?? '', label: 'KEY' }
              : { kind: v as 'dynamite' | 'slug' },
        };
      }
    });
    if (n.contents?.pickup?.kind === 'key') {
      const pk = n.contents.pickup;
      const doorIds = EDGES.filter((e) => e.door).map((e) => `${e.a}→${e.b}`);
      selectField(form, 'keyFor (its door)', doorIds, () => pk.keyFor ?? doorIds[0], (v) => (pk.keyFor = v));
      const r = row(form, 'key tag label');
      const i = document.createElement('input');
      i.value = pk.label ?? '';
      i.addEventListener('change', () => {
        pk.label = i.value.trim() || undefined;
        api.commit();
      });
      r.appendChild(i);
    }
    // contents JSON
    const ta = document.createElement('textarea');
    ta.className = 'ed-json';
    ta.rows = 3;
    ta.value = n.contents ? JSON.stringify(n.contents) : '';
    ta.placeholder = 'contents JSON e.g. {"perk":"ironLungs"}';
    ta.addEventListener('change', () => {
      try {
        n.contents = ta.value.trim() === '' ? undefined : (JSON.parse(ta.value) as CaveNode['contents']);
        api.commit();
      } catch {
        toast('BAD CONTENTS JSON — not applied');
      }
    });
    form.appendChild(ta);
    const acts = document.createElement('div');
    acts.className = 'ed-actions';
    for (const [label, fn] of [
      ['⌖ frame', api.frame],
      ['⟲ orient (R)', api.toggleOrient],
      ['💧 water (W)', api.toggleWater],
      ['⧉ duplicate', api.duplicateNode],
      ['✕ delete', api.deleteSelection],
    ] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', fn);
      acts.appendChild(b);
    }
    form.appendChild(acts);
  };

  const edgeForm = (e: CaveEdge): void => {
    const h = document.createElement('div');
    h.className = 'ed-title';
    h.textContent = `TUNNEL · ${e.a} ↔ ${e.b}`;
    form.appendChild(h);
    selectField(form, 'width', ['open', 'normal', 'squeeze'], () => e.width, (v) => (e.width = v as CaveEdge['width']));
    numField(form, 'tilt °max', () => e.tilt?.maxDeg, (v) => (e.tilt = v === undefined ? undefined : { maxDeg: v }), 15);
    selectField(form, 'door', ['none', 'debris', 'grate', 'hatch'], () => e.door?.kind ?? 'none', (v) => {
      e.door = v === 'none' ? undefined : { cost: e.door?.cost ?? 1000, kind: v as 'debris' | 'grate' | 'hatch', at: e.door?.at };
    });
    numField(form, 'door cost', () => e.door?.cost, (v) => {
      if (e.door && v !== undefined) e.door.cost = v;
    }, 250);
    numField(form, 'door at 0..1', () => e.door?.at, (v) => {
      if (e.door) e.door.at = v;
    }, 0.05);
    boolField(form, 'powerGate', () => !!e.powerGate, (v) => (e.powerGate = v || undefined));
    numField(form, 'gateAt 0..1', () => e.gateAt, (v) => (e.gateAt = v), 0.05);
    boolField(form, 'slide (wet chute)', () => !!e.slide, (v) => (e.slide = v || undefined));
    numField(form, 'airGap m', () => e.airGap, (v) => (e.airGap = v), 0.1);
    if (e.slide) numField(form, 'waterY (plunge)', () => e.waterY, (v) => (e.waterY = v), 0.25);
    vecField(form, 'falseUp', () => e.falseUp, (v) => (e.falseUp = v ?? undefined));
    const wp = document.createElement('div');
    wp.className = 'ed-note';
    wp.textContent = `${e.waypoints?.length ?? 0} waypoint(s) — orange handles; dbl-click the tunnel to add one`;
    form.appendChild(wp);
    const acts = document.createElement('div');
    acts.className = 'ed-actions';
    const orient = document.createElement('button');
    orient.textContent = '⟲ orient (R)';
    orient.addEventListener('click', api.toggleOrient);
    acts.appendChild(orient);
    const del = document.createElement('button');
    del.textContent = '✕ delete tunnel';
    del.addEventListener('click', api.deleteSelection);
    acts.appendChild(del);
    form.appendChild(acts);
  };

  const wpForm = (edgeIndex: number, wpIndex: number): void => {
    const e = EDGES[edgeIndex];
    const h = document.createElement('div');
    h.className = 'ed-title';
    h.textContent = `WAYPOINT ${wpIndex + 1} · ${e.a} ↔ ${e.b}`;
    form.appendChild(h);
    posInputs = vecField(form, 'pos', () => e.waypoints![wpIndex], (v) => (e.waypoints![wpIndex] = v ?? e.waypoints![wpIndex]));
    const acts = document.createElement('div');
    acts.className = 'ed-actions';
    const toRoom = document.createElement('button');
    toRoom.textContent = '⭘ → room';
    toRoom.title = 'Replace this waypoint with a small room (splits the tunnel). Squeeze bends need a chamber you can turn around in.';
    toRoom.addEventListener('click', api.waypointToRoom);
    acts.appendChild(toRoom);
    const del = document.createElement('button');
    del.textContent = '✕ delete waypoint';
    del.addEventListener('click', api.deleteSelection);
    acts.appendChild(del);
    const back = document.createElement('button');
    back.textContent = '↰ tunnel';
    back.addEventListener('click', () => api.select({ kind: 'edge', index: edgeIndex }));
    acts.appendChild(back);
    form.appendChild(acts);
  };

  const hubsForm = (): void => {
    const h = document.createElement('div');
    h.className = 'ed-title';
    h.textContent = 'NOTHING SELECTED';
    form.appendChild(h);
    const note = document.createElement('div');
    note.className = 'ed-note';
    note.textContent =
      `${NODES.length} rooms · ${EDGES.length} tunnels. Zone hubs: each zone names its "center" room — the rule checks below measure routes (two disjoint paths, air distances) to these. Changing one only re-aims the checks; it does not move anything.`;
    form.appendChild(note);
    for (const z of ZONES) {
      const ids = NODES.filter((n) => n.zone === z).map((n) => n.id);
      const cur = ZONE_HUBS[z];
      // a hub id can go stale (room deleted or re-zoned) — surface that
      // instead of silently showing the first option
      const options = ids.includes(cur) ? ids : [`⚠ ${cur} (not in ${z})`, ...ids];
      selectField(form, `${z} hub`, options, () => (ids.includes(cur) ? cur : options[0]), (v) => {
        if (!v.startsWith('⚠')) ZONE_HUBS[z] = v;
      });
    }
  };

  const refresh = (): void => {
    form.textContent = '';
    posInputs = [];
    const sel = api.getSelection();
    if (sel?.kind === 'node') {
      try {
        nodeForm(getNode(sel.id));
      } catch {
        hubsForm();
      }
    } else if (sel?.kind === 'edge' && EDGES[sel.index]) {
      edgeForm(EDGES[sel.index]);
    } else if (sel?.kind === 'waypoint' && EDGES[sel.edgeIndex]?.waypoints?.[sel.wpIndex]) {
      wpForm(sel.edgeIndex, sel.wpIndex);
    } else {
      hubsForm();
    }
    // rule checks
    checksEl.textContent = '';
    const title = document.createElement('div');
    title.className = 'ed-title';
    title.textContent = 'RULE CHECKS (DESIGN §5)';
    checksEl.appendChild(title);
    try {
      for (const c of runChecks()) {
        const d = document.createElement('div');
        d.className = c.pass ? 'check-pass' : 'check-fail';
        d.textContent = `${c.pass ? '✓' : '✗'} ${c.name}${c.pass ? '' : ` — ${c.detail}`}`;
        checksEl.appendChild(d);
      }
    } catch (err) {
      const d = document.createElement('div');
      d.className = 'check-fail';
      d.textContent = `✗ checks crashed: ${(err as Error).message}`;
      checksEl.appendChild(d);
    }
  };

  const refreshLive = (): void => {
    const sel = api.getSelection();
    let pos: [number, number, number] | undefined;
    if (sel?.kind === 'node') pos = getNode(sel.id).pos;
    else if (sel?.kind === 'waypoint') pos = EDGES[sel.edgeIndex]?.waypoints?.[sel.wpIndex];
    if (pos && posInputs.length === 3) {
      posInputs.forEach((i, k) => (i.value = String(Math.round(pos[k] * 100) / 100)));
    }
  };

  return { refresh, refreshLive, toast };
}
