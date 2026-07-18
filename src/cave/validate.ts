// Layout-rule assertions from DESIGN.md §5, run by Vitest and shown in the
// map viewer. If the data violates a rule, this is what says so.

import { buildAdjacency, EDGES, edgeLength, getNode, NODES, ZONE_HUBS, type CaveEdge, type Zone } from './data';
import { TUNING } from '../tuning';

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const AIR_ALLOWANCE_SEC: Record<Zone, number> = {
  sinkhole: 45,
  galleries: 45,
  maze: 45,
  throat: 75, // the deliberate commitment stretch (DESIGN §5)
  abyss: 75,
};

function isAirSource(id: string): boolean {
  const n = getNode(id);
  return n.tags.includes('airPocket') || n.tags.includes('surface') || !!n.dry;
}

function connectedComponent(start: string, edges: CaveEdge[]): Set<string> {
  const adj = buildAdjacency(edges);
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const { other } of adj[cur] ?? []) {
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

// Edge-disjoint max flow (unit capacities, undirected) via BFS augmentation.
function maxFlow(source: string, sink: string, limit: number): number {
  const cap = new Map<string, number>();
  const key = (a: string, b: string) => `${a}→${b}`;
  const adj = new Map<string, string[]>();
  for (const e of EDGES) {
    cap.set(key(e.a, e.b), 1);
    cap.set(key(e.b, e.a), 1);
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  let flow = 0;
  while (flow < limit) {
    const prev = new Map<string, string>();
    const queue = [source];
    prev.set(source, source);
    while (queue.length && !prev.has(sink)) {
      const cur = queue.shift()!;
      for (const nxt of adj.get(cur) ?? []) {
        if (!prev.has(nxt) && (cap.get(key(cur, nxt)) ?? 0) > 0) {
          prev.set(nxt, cur);
          queue.push(nxt);
        }
      }
    }
    if (!prev.has(sink)) break;
    let cur = sink;
    while (cur !== source) {
      const p = prev.get(cur)!;
      cap.set(key(p, cur), (cap.get(key(p, cur)) ?? 0) - 1);
      cap.set(key(cur, p), (cap.get(key(cur, p)) ?? 0) + 1);
      cur = p;
    }
    flow++;
  }
  return flow;
}

// Dijkstra over path length (meters) from every node to its nearest air source.
function airDistances(): Map<string, number> {
  const adj = buildAdjacency();
  const dist = new Map<string, number>();
  const pending: [string, number][] = [];
  for (const n of NODES) {
    if (isAirSource(n.id)) {
      dist.set(n.id, 0);
      pending.push([n.id, 0]);
    }
  }
  while (pending.length) {
    pending.sort((a, b) => b[1] - a[1]);
    const [cur, d] = pending.pop()!;
    if (d > (dist.get(cur) ?? Infinity)) continue;
    for (const { other, length } of adj[cur]) {
      const nd = d + length;
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd);
        pending.push([other, nd]);
      }
    }
  }
  return dist;
}

export function runChecks(): CheckResult[] {
  const results: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => results.push({ name, pass, detail });

  // Connectivity (fully open)
  const component = connectedComponent(NODES[0].id, EDGES);
  const missing = NODES.filter((n) => !component.has(n.id)).map((n) => n.id);
  check('all nodes connected', missing.length === 0, missing.length ? `unreachable: ${missing.join(', ')}` : `${NODES.length} nodes, one component`);

  // Two-route rule: ≥2 edge-disjoint routes surface ↔ each zone hub (fully open)
  for (const [zone, hub] of Object.entries(ZONE_HUBS)) {
    if (zone === 'sinkhole') continue;
    const flow = maxFlow(ZONE_HUBS.sinkhole, hub, 2);
    check(`two disjoint routes to ${zone}`, flow >= 2, `max edge-disjoint flow surface→${hub}: ${flow}`);
  }

  // Door-alternate rule: removing any single door edge never disconnects its endpoints
  for (const e of EDGES.filter((e) => e.door)) {
    const rest = EDGES.filter((x) => x !== e);
    const comp = connectedComponent(e.a, rest);
    check(`door ${e.a}↔${e.b} has an alternate`, comp.has(e.b), comp.has(e.b) ? 'route exists without this door' : 'DOOR IS A SOLE ROUTE');
  }

  // Air rule: nearest air within the zone allowance at base swim speed
  const dist = airDistances();
  let worst = { id: '-', over: 0 };
  let airOk = true;
  for (const n of NODES) {
    const allowM = AIR_ALLOWANCE_SEC[n.zone] * TUNING.player.swimSpeed;
    const d = dist.get(n.id) ?? Infinity;
    if (d > allowM) {
      airOk = false;
      if (d - allowM > worst.over) worst = { id: n.id, over: d - allowM };
    }
  }
  check('air rule (all nodes within allowance)', airOk, airOk ? 'every node within zone allowance' : `worst offender: ${worst.id} (+${worst.over.toFixed(0)} m)`);

  // Vertical passage ≥25 m: chains of near-vertical edges
  const adj = buildAdjacency();
  let bestVertical = 0;
  for (const n of NODES) {
    // walk downward chains of near-vertical edges
    let cur = n.id;
    let total = 0;
    for (;;) {
      const next = adj[cur].find(({ edge, other }) => {
        const dy = getNode(cur).pos[1] - getNode(other).pos[1];
        return dy > 0 && dy >= 0.9 * edgeLength(edge);
      });
      if (!next) break;
      total += getNode(cur).pos[1] - getNode(next.other).pos[1];
      cur = next.other;
    }
    bestVertical = Math.max(bestVertical, total);
  }
  check('vertical passage ≥25 m', bestVertical >= 25, `longest dead-vertical chain: ${bestVertical.toFixed(1)} m`);

  // Counts
  const squeezes = EDGES.filter((e) => e.width === 'squeeze').length;
  check('squeezes ≥4', squeezes >= 4, `${squeezes} squeeze passages`);

  const degree = new Map<string, number>();
  for (const e of EDGES) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const deadEnds = NODES.filter(
    (n) =>
      (degree.get(n.id) ?? 0) === 1 &&
      !n.tags.includes('burrow') &&
      !n.tags.includes('airPocket') &&
      !n.tags.includes('heart') &&
      !n.tags.includes('surface'),
  );
  check('dead ends ≥8', deadEnds.length >= 8, `${deadEnds.length}: ${deadEnds.map((n) => n.id).join(', ')}`);

  const mounds = NODES.filter((n) => n.tags.includes('chalkMound')).length;
  check('chalk mounds 6–10', mounds >= 6 && mounds <= 10, `${mounds} mounds`);

  const tapes = NODES.flatMap((n) => (n.contents?.tape ? [n.contents.tape] : []));
  check('tapes T1–T6 exactly once', tapes.length === 6 && new Set(tapes).size === 6, tapes.sort().join(','));

  const toys = NODES.filter((n) => n.tags.includes('toy'));
  const toyColors = new Set(toys.map((t) => t.contents?.toyColor));
  const toysInDeadEnds = toys.every((t) => (degree.get(t.id) ?? 0) === 1);
  check('3 toys, unique colors, in dead ends', toys.length === 3 && toyColors.size === 3 && toysInDeadEnds, toys.map((t) => `${t.id}(${t.contents?.toyColor})`).join(', '));

  const posters = NODES.flatMap((n) => (n.contents?.poster ? [n.contents.poster] : []));
  const wantPosters = ['G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G10', 'G11', 'G12', 'G13'];
  const missingPosters = wantPosters.filter((p) => !posters.includes(p as never));
  check('all world posters placed', missingPosters.length === 0, missingPosters.length ? `missing: ${missingPosters.join(',')}` : posters.sort().join(','));

  for (const tag of ['power', 'pap', 'heart', 'jukebox'] as const) {
    const count = NODES.filter((n) => n.tags.includes(tag)).length;
    check(`exactly one ${tag}`, count === 1, `${count}`);
  }
  check('three box spots', NODES.filter((n) => n.tags.includes('boxSpot')).length === 3, 'A galleries / B maze / C abyss');

  const perks = NODES.flatMap((n) => (n.contents?.perk ? [n.contents.perk] : []));
  check('all 9 perks placed once', perks.length === 9 && new Set(perks).size === 9, perks.sort().join(','));

  const doorCosts = EDGES.filter((e) => e.door).map((e) => e.door!.cost).sort((a, b) => a - b);
  check('6 doors at DESIGN costs', JSON.stringify(doorCosts) === JSON.stringify([750, 1000, 1250, 1250, 1500, 2000]), doorCosts.join(','));

  const burrows = NODES.filter((n) => n.tags.includes('burrow')).length;
  check('burrows ≥10', burrows >= 10, `${burrows} burrows`);

  return results;
}
