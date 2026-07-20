// HUD v1 (DESIGN §12): O2 bottom-left, battery pips bottom-right, depth gauge
// + trend bottom-center, points/ammo placeholders. Minimal, monospace, dark.

import type { Vitals } from '../player/vitals';
import type { GuideLine } from '../player/line';
import type { Chemlights } from '../player/chemlights';
import { TUNING } from '../tuning';

export class Hud {
  private beatEl!: HTMLElement;
  private bpmEl!: HTMLElement;
  private o2Fill: HTMLElement;
  private o2Num: HTMLElement;
  private pips: HTMLElement[];
  private lightState: HTMLElement;
  private depthEl: HTMLElement;
  private pointsEl: HTMLElement;
  private kitEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer: number | null = null;
  private vignette: HTMLElement;
  private deathEl: HTMLElement;
  private lastDepth = 0;
  private trendTimer = 0;
  private trend = '─';

  constructor(ui: HTMLElement) {
    const make = (id: string, parent: HTMLElement = ui): HTMLElement => {
      const d = document.createElement('div');
      d.id = id;
      parent.appendChild(d);
      return d;
    };
    this.vignette = make('hud-vignette');
    const hr = make('hud-hr');
    hr.innerHTML = '<span class="beat">♥</span><span class="bpm"></span>';
    this.beatEl = hr.querySelector('.beat') as HTMLElement;
    this.bpmEl = hr.querySelector('.bpm') as HTMLElement;
    const o2 = make('hud-o2');
    o2.innerHTML = '<span class="label">O2</span><div class="bar"><div class="fill"></div></div><span class="num"></span>';
    this.o2Fill = o2.querySelector('.fill') as HTMLElement;
    this.o2Num = o2.querySelector('.num') as HTMLElement;
    const bat = make('hud-battery');
    bat.innerHTML = '<span class="label">LAMP</span>' + '<span class="pip"></span>'.repeat(5) + '<span class="state"></span>';
    this.pips = Array.from(bat.querySelectorAll('.pip'));
    this.lightState = bat.querySelector('.state') as HTMLElement;
    this.depthEl = make('hud-depth');
    const pts = make('hud-points');
    pts.textContent = String(TUNING.economy.startPoints);
    this.pointsEl = pts;
    const ammo = make('hud-ammo');
    ammo.textContent = '—/—';
    this.kitEl = make('hud-kit');
    this.toastEl = make('hud-toast');
    this.deathEl = make('hud-death');
    this.deathEl.innerHTML = '<div class="big">RECOVERY INCOMPLETE</div><div class="small">the site keeps its complement</div><div class="small">press R to dive again</div>';
    this.deathEl.classList.add('hidden');
  }

  update(dt: number, v: Vitals, depth: number): void {
    // heart rate: number + a glyph that pulses at the actual bpm
    this.bpmEl.textContent = ` ${v.hr.toFixed(0)}`;
    this.beatEl.style.animationDuration = `${(60 / Math.max(40, v.hr)).toFixed(2)}s`;
    this.beatEl.classList.toggle('hard', v.hr > 130);

    // O2 bar — or the flashing-red reserve breath once the tank is empty
    if (v.inReserve) {
      this.o2Fill.style.width = `${(v.reserve * 100).toFixed(0)}%`;
      this.o2Fill.classList.add('reserve');
      this.o2Num.textContent = '!!';
    } else {
      const frac = v.air / TUNING.air.capacity;
      this.o2Fill.style.width = `${(frac * 100).toFixed(0)}%`;
      this.o2Fill.classList.remove('reserve');
      this.o2Fill.classList.toggle('low', v.lowAir);
      this.o2Num.textContent = v.air.toFixed(0);
    }

    this.pips.forEach((p, i) => {
      p.classList.toggle('on', v.battery > i / 5 + 0.01);
    });
    this.lightState.textContent = v.flashlightOn ? '' : 'OFF';

    this.trendTimer += dt;
    if (this.trendTimer >= 0.5) {
      this.trend = depth > this.lastDepth + 0.1 ? '▼' : depth < this.lastDepth - 0.1 ? '▲' : '─';
      this.lastDepth = depth;
      this.trendTimer = 0;
    }
    this.depthEl.textContent = `${Math.max(0, depth).toFixed(1)} m ${this.trend}`;

    // low-air / drowning vignette
    const danger = v.air <= 0 ? 1 : v.lowAir ? 1 - v.air / TUNING.air.lowThreshold : 0;
    this.vignette.style.opacity = String(danger * 0.65);

    this.deathEl.classList.toggle('hidden', !v.dead);
  }

  setPoints(p: number): void {
    this.pointsEl.textContent = String(p);
  }

  /** Guide line + chemlight readout with a CLEAR line state and the current
   *  T/X options spelled out in place (controls rework 2026-07-19: players
   *  work the line constantly and in a panic — the HUD teaches the keys). */
  updateKit(line: GuideLine, chems: Chemlights, following: boolean, grabbing: boolean, nearEnd: boolean): void {
    const parts = [`REEL ${line.reelM.toFixed(0)}m`];
    if (line.deployed) parts.push(`OUT ${line.deployedLengthM.toFixed(0)}m`);
    const state = following
      ? 'ON LINE'
      : line.mode === 'laying'
        ? '● LAYING · T stop · X tie'
        : line.mode === 'reeling'
          ? line.reelBlocked
            ? '⟲ PINNED · tap X cuts the tie'
            : '⟲ REELING'
          : line.deployed
            ? nearEnd
              ? 'LINE END · T resume · hold X reel'
              : 'LINE DOWN · hold T ride · T at line forks'
            : 'T — lay line';
    parts.push(state);
    if (grabbing) parts.push('GRABBING');
    parts.push(`GLO ${chems.count}`);
    this.kitEl.textContent = parts.join(' · ');
    this.kitEl.classList.toggle('online', following || grabbing || line.mode === 'laying' || line.mode === 'reeling');
  }

  /** Big center-screen confirmation flash (probes, line actions). */
  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1900);
  }
}
