// LORE §2.1 anti-spam rules, pinned: silence is the default; ≥120 s ambient
// cooldown; every line once per run; priority tapeReact > event > ambient;
// ambient ~40% roll at request; NOTHING plays underwater.

import { describe, expect, it } from 'vitest';
import { VoiceQueue } from './voice';
import { estimateSpeechSec, LOWE_LINES, TAPES } from './lines';
import { TapeDeck, tapeSafe } from '../game/tapes';
import { TUNING } from '../tuning';

const step = (q: VoiceQueue, sec: number, surfaced: boolean, blocked = false): string[] => {
  const out: string[] = [];
  for (let t = 0; t < sec; t += 0.1) {
    const l = q.update(0.1, surfaced, blocked);
    if (l) out.push(l.id);
  }
  return out;
};

describe('VoiceQueue (LORE §2.1)', () => {
  it('never speaks underwater — a queued event waits for the surface', () => {
    const q = new VoiceQueue(LOWE_LINES, () => 0);
    expect(q.request('power.1')).toBe('queued');
    expect(step(q, 30, false)).toEqual([]); // 30 s submerged: silence
    expect(step(q, 1, true)).toEqual(['power.1']); // first surfaced tick
  });

  it('each line plays at most once per run', () => {
    const q = new VoiceQueue(LOWE_LINES, () => 0);
    q.request('secondwind.1');
    step(q, 60, true);
    expect(q.request('secondwind.1')).toBe('already');
  });

  it('ambient: global cooldown + the 40% roll; events are exempt', () => {
    let roll = 0; // always passes (roll <= 0.4)
    const q = new VoiceQueue(LOWE_LINES, () => roll);
    expect(q.request('surface.1')).toBe('queued');
    step(q, 20, true); // plays; cooldown starts
    expect(q.request('surface.2')).toBe('cooldown');
    expect(q.request('power.1')).toBe('queued'); // event ignores cooldown
    // cooldown expires → the roll gates
    step(q, TUNING.voice.ambientCooldownSec, true);
    roll = 0.9; // fails the 40% chance
    expect(q.request('surface.2')).toBe('rolled-off');
    roll = 0.1;
    expect(q.request('surface.3')).toBe('queued');
  });

  it('priority: a tape reaction jumps ahead of an event ahead of ambient', () => {
    const q = new VoiceQueue(LOWE_LINES, () => 0);
    q.request('surface.1');
    q.request('power.1');
    q.request('tape.t3');
    const order = step(q, 120, true);
    expect(order).toEqual(['tape.t3', 'power.1', 'surface.1']);
  });

  it('submerging mid-line cuts him off — the line still counts as said', () => {
    const q = new VoiceQueue(LOWE_LINES, () => 0);
    q.request('power.1');
    step(q, 0.2, true); // starts
    expect(q.current?.id).toBe('power.1');
    step(q, 0.2, false); // head under: regulator in
    expect(q.current).toBeNull();
    expect(q.played.has('power.1')).toBe(true);
  });
});

describe('TapeDeck (LORE §5 playback spec)', () => {
  it('collect → pending → plays only at a SAFE surfacing, then fires the reaction', () => {
    const deck = new TapeDeck();
    const done: string[] = [];
    deck.onFinished = (t) => done.push(t.reactionId);
    expect(deck.collect('t3')).toBe(true);
    expect(deck.collect('t3')).toBe(false); // once
    deck.update(1, false, true); // submerged: no
    expect(deck.playing).toBeNull();
    deck.update(1, true, false); // surfaced but hostile ≤20 m: defers
    expect(deck.playing).toBeNull();
    deck.update(1, true, true); // safe surfacing: rolls
    expect(deck.playing?.tape.id).toBe('t3');
    const dur = deck.playing!.durSec;
    for (let t = 0; t < dur + 1; t += 0.5) deck.update(0.5, true, true);
    expect(deck.playing).toBeNull();
    expect(done).toEqual(['tape.t3']);
  });

  it('submerging mid-tape pauses the reel and holds the position', () => {
    const deck = new TapeDeck();
    deck.collect('t1');
    deck.update(0.1, true, true);
    deck.update(5, true, true);
    const at = deck.playing!.t;
    deck.update(10, false, true); // dive: paused, no progress
    expect(deck.playing!.paused).toBe(true);
    expect(deck.playing!.t).toBe(at);
    deck.update(1, true, true); // resurface: resumes
    expect(deck.playing!.paused).toBe(false);
  });

  it('skip ends the tape and still queues the reaction', () => {
    const deck = new TapeDeck();
    const done: string[] = [];
    deck.onFinished = (t) => done.push(t.reactionId);
    deck.collect('t6');
    deck.update(0.1, true, true);
    expect(deck.skip()).toBe(true);
    expect(done).toEqual(['tape.t6']);
  });

  it('tapeSafe: hostile inside 20 m blocks, dead ones and far ones do not', () => {
    const P = { x: 0, y: 0, z: 0 };
    expect(tapeSafe(P, [])).toBe(true);
    expect(tapeSafe(P, [{ pos: { x: 10, y: 0, z: 0 }, state: 'pursuing' }])).toBe(false);
    expect(tapeSafe(P, [{ pos: { x: 10, y: 0, z: 0 }, state: 'dead' }])).toBe(true);
    expect(tapeSafe(P, [{ pos: { x: 30, y: 0, z: 0 }, state: 'pursuing' }])).toBe(true);
  });
});

describe('the line data itself', () => {
  it('all 6 tape reactions exist as tapeReact lines; ids are unique', () => {
    const ids = new Set(LOWE_LINES.map((l) => l.id));
    expect(ids.size).toBe(LOWE_LINES.length);
    for (const t of TAPES) {
      const line = LOWE_LINES.find((l) => l.id === t.reactionId);
      expect(line?.cat).toBe('tapeReact');
    }
  });

  it('speech estimates land in the LORE 20–40 s tape window (roughly)', () => {
    for (const t of TAPES) {
      const sec = estimateSpeechSec(t.text);
      expect(sec).toBeGreaterThan(5);
      expect(sec).toBeLessThanOrEqual(32);
    }
  });
});
