// Menu UI sounds (user 2026-07-21): an echoy digital blip on click, a soft
// tick on hover. Self-contained WebAudio — its own tiny context, because the
// game engine may not exist yet at the title screen. Synth only (these are
// interface sounds, not world sounds — the site's instruments beep dry).

import { SETTINGS } from './settings';

let ctx: AudioContext | null = null;
let echo: DelayNode | null = null;

function ensure(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      // the echo tail: a feedback delay every blip runs through
      echo = ctx.createDelay(0.5);
      echo.delayTime.value = 0.16;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      echo.connect(fb);
      fb.connect(echo);
      echo.connect(wet);
      wet.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function blip(hz: number, hzEnd: number, dur: number, gain: number): void {
  const c = ensure();
  if (!c || !echo) return;
  const v = gain * SETTINGS.volumeMaster;
  if (v <= 0) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(hz, t);
  osc.frequency.exponentialRampToValueAtTime(hzEnd, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(c.destination); // dry
  g.connect(echo); // the digital echo tail
  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc.onended = () => g.disconnect();
}

/** A button press: two-tone digital chirp with the echo tail. */
export function uiClick(): void {
  blip(1040, 620, 0.11, 0.16);
  window.setTimeout(() => blip(780, 780, 0.07, 0.1), 45);
}

/** Hover: one soft high tick, much quieter. */
export function uiHover(): void {
  blip(1480, 1480, 0.045, 0.05);
}
