// M12 — ONE VOICE, ONE SONG (DESIGN §14): the speech slot and the music
// slot. These tests pin the arbitration rules the user asked for verbatim:
// never two voices at once, never two songs at once, and the lull only ever
// grows out of true silence.

import { describe, expect, it } from 'vitest';
import { arbitrate } from './speech';
import { MusicDirector, type TrackHandle } from './music';
import { VoiceQueue } from './voice';
import type { VoLine } from './lines';

const L = (id: string, cat: VoLine['cat']): VoLine => ({ id, cat, text: 'x'.repeat(60) });

describe('speech slot (one voice, ever)', () => {
  it('a playing tape blocks both voices', () => {
    const d = arbitrate(true, { speaking: false, next: 'tapeReact' }, { speaking: false, next: 'event' });
    expect(d.loweBlocked).toBe(true);
    expect(d.remoraBlocked).toBe(true);
  });

  it('an active speaker keeps the slot — no barging mid-line', () => {
    expect(arbitrate(false, { speaking: true, next: null }, { speaking: false, next: 'tapeReact' }).remoraBlocked).toBe(true);
    expect(arbitrate(false, { speaking: false, next: 'tapeReact' }, { speaking: true, next: null }).loweBlocked).toBe(true);
  });

  it('free slot goes to the higher-priority head-of-queue; ties go to Lowe', () => {
    const d1 = arbitrate(false, { speaking: false, next: 'ambient' }, { speaking: false, next: 'event' });
    expect(d1.loweBlocked).toBe(true);
    expect(d1.remoraBlocked).toBe(false);
    const d2 = arbitrate(false, { speaking: false, next: 'event' }, { speaking: false, next: 'event' });
    expect(d2.loweBlocked).toBe(false);
    expect(d2.remoraBlocked).toBe(true);
  });

  it('E2E through two real queues: never two currents at once', () => {
    const lowe = new VoiceQueue([L('a.1', 'event'), L('a.2', 'event')], () => 0);
    const rem = new VoiceQueue([L('b.1', 'event'), L('b.2', 'event')], () => 0);
    lowe.request('a.1');
    lowe.request('a.2');
    rem.request('b.1');
    rem.request('b.2');
    let overlaps = 0;
    for (let t = 0; t < 60; t += 0.5) {
      const d = arbitrate(false, { speaking: lowe.current !== null, next: lowe.peek() }, { speaking: rem.current !== null, next: rem.peek() });
      lowe.update(0.5, true, d.loweBlocked);
      rem.update(0.5, true, d.remoraBlocked);
      if (lowe.current && rem.current) overlaps++;
    }
    expect(overlaps).toBe(0);
    expect(lowe.played.size).toBe(2);
    expect(rem.played.size).toBe(2);
  });
});

const stubFactory = (log: string[]): ((url: string, gain: number, loop: boolean, onEnded: () => void) => TrackHandle) => {
  return (url) => {
    log.push(`start ${url}`);
    return { stop: () => log.push(`stop ${url}`) };
  };
};

describe('music slot (one song, ever)', () => {
  it('starting a song stops the previous one', () => {
    const log: string[] = [];
    const m = new MusicDirector();
    m.wire(stubFactory(log));
    m.play('jukebox', 'a.mp3', 1);
    m.play('moonlight', 'b.mp3', 1);
    expect(log).toEqual(['start a.mp3', 'stop a.mp3', 'start b.mp3']);
    expect(m.current?.id).toBe('moonlight');
  });

  it('the lull needs true quiet: no music AND no dialog for afterSec', () => {
    const m = new MusicDirector();
    m.wire(stubFactory([]));
    // dialog running: quiet never accrues
    for (let i = 0; i < 300; i++) m.update(1, true);
    expect(m.tryLull('lull.mp3', 1, 240, 600)).toBe(false);
    // true silence accrues and earns the lull
    for (let i = 0; i < 241; i++) m.update(1, false);
    expect(m.tryLull('lull.mp3', 1, 240, 600)).toBe(true);
    expect(m.current?.id).toBe('lull');
  });

  it('music playing resets the quiet clock — a jukebox evening never earns a lull', () => {
    const m = new MusicDirector();
    m.wire(stubFactory([]));
    m.play('jukebox', 'a.mp3', 1);
    for (let i = 0; i < 300; i++) m.update(1, false);
    expect(m.quietT).toBe(0);
    expect(m.tryLull('lull.mp3', 1, 240, 600)).toBe(false);
  });

  it('the lull yields instantly to an explicit song and honors its cooldown', () => {
    const log: string[] = [];
    const m = new MusicDirector();
    m.wire(stubFactory(log));
    for (let i = 0; i < 241; i++) m.update(1, false);
    m.tryLull('lull.mp3', 1, 240, 600);
    m.play('jukebox', 'a.mp3', 1); // player hits the jukebox mid-lull
    expect(log).toEqual(['start lull.mp3', 'stop lull.mp3', 'start a.mp3']);
    m.stop();
    for (let i = 0; i < 241; i++) m.update(1, false);
    expect(m.tryLull('lull.mp3', 1, 240, 600)).toBe(false); // cooldown holds
  });

  it('a finished track frees the slot and fires onStopped', () => {
    let ended: (() => void) | null = null;
    const m = new MusicDirector();
    m.wire((_url, _gain, _loop, onEnded) => {
      ended = onEnded;
      return { stop: () => {} };
    });
    let stoppedFired = 0;
    m.onStopped = () => stoppedFired++;
    m.play('moonlight', 'b.mp3', 1);
    expect(m.playing).toBe(true);
    ended!();
    expect(m.playing).toBe(false);
    expect(stoppedFired).toBe(1);
  });
});
