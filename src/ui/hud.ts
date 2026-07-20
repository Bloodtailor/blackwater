// HUD v1 (DESIGN §12): O2 bottom-left, battery pips bottom-right, depth gauge
// + trend bottom-center, points/ammo placeholders. Minimal, monospace, dark.

import type { Vitals } from '../player/vitals';
import type { GuideLine } from '../player/line';
import type { Chemlights } from '../player/chemlights';
import type { Weapons } from '../player/weapons';
import type { PerkId } from '../cave/data';
import type { Prompt } from '../economy/interact';
import { PERK_INFO } from '../economy/perks';
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
  private roundEl: HTMLElement;
  private stirsEl: HTMLElement;
  private ammoEl: HTMLElement;
  private crossEl: HTMLElement;
  private hitmarkEl: HTMLElement;
  private damageEl: HTMLElement;
  private ptickEl: HTMLElement;
  private promptEl!: HTMLElement;
  private promptLine!: HTMLElement;
  private promptSub!: HTMLElement;
  private promptFill!: HTMLElement;
  private perksEl!: HTMLElement;
  private blackoutEl!: HTMLElement;
  /** Second Wind blackout suppresses the death screen while it plays. */
  suppressDeath = false;
  private hitmarkTimer: number | null = null;
  private ptickTimer: number | null = null;
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
    this.ammoEl = make('hud-ammo');
    this.ammoEl.textContent = '—/—';
    this.roundEl = make('hud-round');
    this.stirsEl = make('hud-stirs');
    this.stirsEl.classList.add('hidden');
    this.crossEl = make('hud-cross');
    this.crossEl.textContent = '·';
    this.hitmarkEl = make('hud-hitmark');
    this.hitmarkEl.textContent = '✕';
    this.damageEl = make('hud-damage');
    this.ptickEl = make('hud-ptick');
    this.promptEl = make('hud-prompt');
    this.promptEl.innerHTML = '<div class="line"></div><div class="sub"></div><div class="bar"><div class="fill"></div></div>';
    this.promptLine = this.promptEl.querySelector('.line') as HTMLElement;
    this.promptSub = this.promptEl.querySelector('.sub') as HTMLElement;
    this.promptFill = this.promptEl.querySelector('.fill') as HTMLElement;
    this.promptEl.classList.add('hidden');
    this.perksEl = make('hud-perks');
    this.blackoutEl = make('hud-blackout');
    this.blackoutEl.classList.add('hidden');
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
      const frac = v.air / v.mods.airCap; // Iron Lungs widens the tank
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

    this.deathEl.classList.toggle('hidden', !v.dead || this.suppressDeath);
  }

  setPoints(p: number): void {
    this.pointsEl.textContent = String(p);
  }

  /** Points delta tick (+60 floating by the balance, DESIGN §12). */
  pointsTick(delta: number): void {
    this.ptickEl.textContent = delta > 0 ? `+${delta}` : String(delta);
    this.ptickEl.classList.remove('show');
    void this.ptickEl.offsetWidth; // restart the CSS animation
    this.ptickEl.classList.add('show');
    if (this.ptickTimer !== null) clearTimeout(this.ptickTimer);
    this.ptickTimer = window.setTimeout(() => this.ptickEl.classList.remove('show'), 900);
  }

  /** Round tally (top-left) with the BO1-homage flicker on change. */
  setRound(n: number): void {
    this.roundEl.textContent = String(n);
    this.roundEl.classList.remove('stinger');
    void this.roundEl.offsetWidth;
    this.roundEl.classList.add('stinger');
  }

  /** The Cave Stirs countdown (DESIGN §9) — visible, or hidden when off. */
  setCaveStirs(secondsLeft: number | null): void {
    if (secondsLeft === null) {
      this.stirsEl.classList.add('hidden');
      return;
    }
    this.stirsEl.classList.remove('hidden');
    this.stirsEl.textContent = `the cave stirs… ${Math.max(0, Math.ceil(secondsLeft))}`;
  }

  /** Ammo + reload state + slot pips (bottom-right). */
  updateWeapon(w: Weapons): void {
    const s = w.current;
    const slots = w.slots.map((_, i) => (i === w.cur ? '●' : '○')).join('');
    const ammo = Number.isFinite(s.mag) ? `${s.mag} / ${s.reserve}` : '—';
    this.ammoEl.textContent = w.reloading ? `${slots} ${s.def.name} · RELOADING` : `${slots} ${s.def.name} · ${ammo}`;
    this.ammoEl.classList.toggle('empty', !w.reloading && s.mag === 0 && s.reserve === 0);
  }

  /** The buy prompt + hold progress (economy, M6a). */
  updatePrompt(p: Prompt | null, progress: number): void {
    if (!p) {
      this.promptEl.classList.add('hidden');
      return;
    }
    this.promptEl.classList.remove('hidden');
    this.promptEl.classList.toggle('disabled', !p.enabled);
    this.promptLine.textContent = `${p.holdSec > 0 ? 'HOLD E — ' : 'E — '}${p.text}`;
    this.promptSub.textContent = p.sub ?? '';
    this.promptSub.classList.toggle('hidden', !p.sub);
    this.promptFill.style.width = `${(progress * 100).toFixed(0)}%`;
    this.promptEl.querySelector('.bar')!.classList.toggle('hidden', p.holdSec <= 0);
  }

  /** Owned-perk chips (bottom-left, above the HR readout). */
  setPerks(owned: Iterable<PerkId>): void {
    this.perksEl.innerHTML = '';
    for (const id of owned) {
      const info = PERK_INFO[id];
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = info.name.split(' ').map((w) => w[0]).join('');
      chip.title = info.name;
      chip.style.borderColor = chip.style.color = `#${info.color.toString(16).padStart(6, '0')}`;
      this.perksEl.appendChild(chip);
    }
  }

  /** Second Wind blackout overlay. */
  blackout(on: boolean, text = ''): void {
    this.blackoutEl.classList.toggle('hidden', !on);
    this.blackoutEl.textContent = text;
    this.suppressDeath = on;
  }

  /** Crosshair flips to the knife glyph when a body is in melee reach —
   *  the range is readable BEFORE you commit (user 2026-07-20). */
  setKnifeReady(ready: boolean): void {
    if (ready === this.knifeReady) return;
    this.knifeReady = ready;
    this.crossEl.textContent = ready ? '✕' : '·';
    this.crossEl.classList.toggle('knife', ready);
  }

  private knifeReady = false;

  /** Subtle hitmarker; red-tinged on headshot (DESIGN §12: subtle). */
  hitmark(head: boolean): void {
    this.hitmarkEl.classList.remove('show', 'head');
    void this.hitmarkEl.offsetWidth;
    this.hitmarkEl.classList.add('show');
    if (head) this.hitmarkEl.classList.add('head');
    if (this.hitmarkTimer !== null) clearTimeout(this.hitmarkTimer);
    this.hitmarkTimer = window.setTimeout(() => this.hitmarkEl.classList.remove('show', 'head'), 220);
  }

  /** Red damage flash (the grab / regulator rip). */
  damageFlash(): void {
    this.damageEl.classList.remove('show');
    void this.damageEl.offsetWidth;
    this.damageEl.classList.add('show');
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
