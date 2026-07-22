// AudioDirector (M8a): the one place game state becomes sound. main.ts calls
// update() once per tick with a snapshot, plus explicit event methods where
// it already owns the moment (a shot, a door, a perk). Everything routes
// through AudioEngine's buses so the underwater/surface/silt filters apply
// globally.
//
// Honest-sound rule (DESIGN §13): moans come from real zombie positions with
// truthful distance/pan/occlusion — no fake far moans, ever.

import type * as THREE from 'three';
import { TUNING } from '../tuning';
import { Ambience } from './ambience';
import { AudioEngine, type PositionalHandle } from './engine';
import { MUSIC } from './music';
import { SAMPLES } from './samples';
import * as sfx from './sfx';

export interface AudioSnapshot {
  playerPos: THREE.Vector3;
  /** Camera right vector (for stereo panning). */
  right: THREE.Vector3;
  headAbove: boolean;
  hr: number;
  air: number;
  lowAir: boolean;
  inReserve: boolean;
  drowning: boolean;
  dead: boolean;
  won: boolean;
  round: number;
  /** Silt thickness 0..1 at the player's chamber (drives the cottony muffle). */
  siltThickness: number;
  zombies: { pos: THREE.Vector3; state: string; crew?: { name: string; voice: { sample: number; rate: number } } }[];
  specials: { kind: string; pos: THREE.Vector3; state: string }[];
  powered: boolean;
}

interface TrackedLoop {
  handle: PositionalHandle;
  stop: sfx.StopFn;
}

export class AudioDirector {
  engine: AudioEngine | null = null;
  /** Last ~40 audio events, newest last (verification + M9 pilot logs). */
  readonly recent: string[] = [];
  /** Depth beds + audio-emitter nodes (user 2026-07-20). */
  readonly ambience = new Ambience();
  private breathT = 0;
  private heartT = 0;
  private moanT = 2;
  private geigerT = 0.3;
  private drownT = 0;
  private lastRound = 0;

  /** M13 hatch toll: main jumps the round counter itself and rings the five
   *  bells — sync the tracker so the horn stinger doesn't pile on top. */
  syncRound(n: number): void {
    this.lastRound = n;
  }
  private deadWas = false;
  private wonWas = false;
  private anglerLoops = new Map<object, TrackedLoop>();
  private guardianLoops = new Map<object, TrackedLoop>();
  /** The Lamp Man's lamp hums EXACTLY like the Angler's lure — the shared
   *  lie is the design (DESIGN §8.5). */
  private lampLoops = new Map<object, TrackedLoop>();
  private vortexStop: sfx.StopFn | null = null;
  private pilePos: [number, number, number] | null = null;

  constructor(pilePos: [number, number, number] | null) {
    this.pilePos = pilePos;
  }

  private note(ev: string): void {
    this.recent.push(ev);
    if (this.recent.length > 40) this.recent.shift();
  }

  /** Create/resume the context — call from a real user gesture. */
  ensure(): AudioEngine {
    if (!this.engine) this.engine = new AudioEngine();
    this.engine.resume();
    // decode the generated ElevenLabs samples for this context up front —
    // otherwise each sound's first occurrence falls back to synth
    SAMPLES.warm(this.engine.ctx);
    return this.engine;
  }

  private get bus(): AudioNode | null {
    return this.engine && this.engine.running ? this.engine.bus : null;
  }

  update(dt: number, s: AudioSnapshot): void {
    const e = this.engine;
    if (!e || !e.running) return;
    const A = TUNING.audio;
    const p = s.playerPos;
    e.setListener(p.x, p.y, p.z, s.right.x, s.right.y, s.right.z);

    // ── the ending (M12; user 2026-07-21): after the win the world is OVER.
    // muteWorld() fades the buses, but heartbeat/stingers ride MASTER and
    // the schedulers kept firing — stop scheduling entirely, kill every
    // positional loop, and pin the music tone bright like open air (bobbing
    // at the waterline must never muffle the coda). ──
    if (s.won) {
      const noLoop = (): TrackedLoop => {
        throw new Error('no loops after the win');
      };
      e.setHeadAbove(true);
      e.setMuffle(0);
      this.syncLoops([], this.anglerLoops, noLoop);
      this.syncLoops([], this.guardianLoops, noLoop);
      this.syncLoops([], this.lampLoops, noLoop);
      if (this.vortexStop) {
        this.vortexStop();
        this.vortexStop = null;
      }
      if (!this.wonWas) {
        if (!MUSIC.playing) {
          sfx.winSting(e.ctx, e.master);
          this.note('winSting');
        } else this.note('winSting-skipped-for-song');
      }
      this.wonWas = true;
      return;
    }

    e.setHeadAbove(s.headAbove);
    e.setMuffle(s.siltThickness);
    this.ambience.update(e, p.x, p.y, p.z, !s.headAbove);

    // ── breathing: the regulator cycle rides the heart rate; silent above
    // water (mouth open, regulator out) and when dead ──
    this.breathT -= dt;
    if (this.breathT <= 0 && !s.headAbove && !s.dead) {
      const panic = Math.min(1, Math.max(0, (s.hr - TUNING.hr.rest) / (TUNING.hr.max - TUNING.hr.rest)));
      sfx.breathCycle(e.ctx, e.underwater, panic);
      this.note('breath');
      this.breathT = Math.max(1.6, 60 / s.hr) * (s.inReserve ? 0.55 : 1);
    }

    // ── heartbeat: audible at low air / in reserve, tempo = the real HR ──
    this.heartT -= dt;
    if (this.heartT <= 0 && (s.lowAir || s.inReserve) && !s.dead) {
      sfx.heartThump(e.ctx, e.master, s.inReserve ? 1 : 0.6);
      this.note('heartbeat');
      this.heartT = 60 / Math.max(40, s.hr);
    }

    // ── drowning: a dull pulse every second while HP is bleeding ──
    this.drownT -= dt;
    if (s.drowning && this.drownT <= 0 && !s.dead) {
      sfx.drownPulse(e.ctx, e.underwater);
      this.note('drown');
      this.drownT = 1.0;
    }

    // ── moans: one at a time from a real body, truthful position ──
    this.moanT -= dt;
    const alive = s.zombies.filter((z) => z.state !== 'dead' && z.state !== 'emerging');
    if (this.moanT <= 0 && alive.length > 0 && !s.dead) {
      const z = alive[Math.floor(Math.random() * alive.length)];
      const h = e.positional(A.moanRefDistM);
      h.setPosition(z.pos.x, z.pos.y, z.pos.z);
      // his own voice (M14.5): every man moans at his own pitch, every watch
      sfx.moan(e.ctx, h.input, z.crew?.voice);
      this.note(`moan ${z.crew?.name ?? '?'} gain=${h.state.gain.toFixed(2)} pan=${h.state.pan.toFixed(2)} occ=${h.state.occluded}`);
      window.setTimeout(() => h.dispose(), 3200);
      this.moanT = A.moanIntervalSec * (0.6 + Math.random() * 0.8) * Math.max(0.4, 1 - alive.length * 0.06);
    }

    // ── specials: looped positional presences, keyed by the special itself ──
    this.syncLoops(
      s.specials.filter((x) => x.kind === 'angler' && x.state !== 'dead'),
      this.anglerLoops,
      () => {
        const h = e.positional(A.anglerRefDistM);
        return { handle: h, stop: sfx.anglerHum(e.ctx, h.input) };
      },
    );
    this.syncLoops(
      s.specials.filter((x) => x.kind === 'guardian' && x.state !== 'dead'),
      this.guardianLoops,
      () => {
        const h = e.positional(A.guardianRefDistM);
        return { handle: h, stop: sfx.guardianPresence(e.ctx, h.input) };
      },
    );
    // the Lamp Man's lamp: the SAME hum as the Angler's lure, deliberately —
    // at range the ear cannot tell which light it is approaching
    this.syncLoops(
      s.specials.filter((x) => x.kind === 'lampman' && x.state !== 'dead'),
      this.lampLoops,
      () => {
        const h = e.positional(A.anglerRefDistM);
        return { handle: h, stop: sfx.anglerHum(e.ctx, h.input) };
      },
    );

    // ── geiger crackle near the Pile: pure flavor, rate falls with distance ──
    if (this.pilePos) {
      this.geigerT -= dt;
      if (this.geigerT <= 0) {
        const d = Math.hypot(p.x - this.pilePos[0], p.y - this.pilePos[1], p.z - this.pilePos[2]);
        if (d < A.geigerRangeM) {
          const rate = 2 + (1 - d / A.geigerRangeM) * 18; // ticks/s up close
          sfx.geigerTick(e.ctx, e.bus);
          this.note('geiger');
          this.geigerT = -Math.log(Math.random()) / rate; // Poisson spacing
        } else this.geigerT = 0.5;
      }
    }

    // ── stingers on state edges ──
    if (s.round !== this.lastRound) {
      if (this.lastRound > 0) {
        // M14 (DESIGN §14): the shift change rings the site's watch BELL —
        // the somber horn retired with the rounds it announced
        sfx.shiftBell(e.ctx, e.master);
        this.note('shiftBell');
      }
      this.lastRound = s.round;
    }
    if (s.dead && !this.deadWas) {
      sfx.deathSting(e.ctx, e.master);
      this.note('deathSting');
    }
    this.deadWas = s.dead;
    // (the win path exits early above — the sting fires there)
  }

  private syncLoops(
    live: { pos: THREE.Vector3 }[],
    map: Map<object, TrackedLoop>,
    make: () => TrackedLoop,
  ): void {
    for (const spec of live) {
      let loop = map.get(spec);
      if (!loop) {
        loop = make();
        map.set(spec, loop);
      }
      loop.handle.setPosition(spec.pos.x, spec.pos.y, spec.pos.z);
    }
    for (const [key, loop] of map) {
      if (!live.includes(key as { pos: THREE.Vector3 })) {
        loop.stop();
        window.setTimeout(() => loop.handle.dispose(), 3000);
        map.delete(key);
      }
    }
  }

  // ── explicit events (main.ts owns the moment) ──
  shot(gunId: string, papped: boolean): void {
    if (this.bus) sfx.gunShot(this.engine!.ctx, this.bus, gunId, papped);
    this.note('gunShot');
  }
  melee(hit: boolean): void {
    if (this.bus) sfx.knifeSwing(this.engine!.ctx, this.bus, hit);
    this.note('knifeSwing');
  }
  reload(): void {
    if (this.bus) sfx.reloadClack(this.engine!.ctx, this.bus);
    this.note('reloadClack');
  }
  grab(): void {
    if (this.bus) sfx.grabImpact(this.engine!.ctx, this.bus);
    this.note('grabImpact');
  }
  siltOut(pos: [number, number, number]): void {
    if (!this.engine || !this.engine.running) return;
    const h = this.engine.positional(TUNING.audio.whumpRefDistM);
    h.setPosition(pos[0], pos[1], pos[2]);
    sfx.siltWhump(this.engine.ctx, h.input);
    this.note('siltWhump');
    window.setTimeout(() => h.dispose(), 5000);
  }
  doorOpen(): void {
    if (this.bus) sfx.doorGrind(this.engine!.ctx, this.bus);
    this.note('doorGrind');
  }
  perkBought(): void {
    if (this.bus) sfx.perkJingle(this.engine!.ctx, this.bus);
    this.note('perkJingle');
  }
  boxSpin(): void {
    if (this.bus) sfx.boxTease(this.engine!.ctx, this.bus);
    this.note('boxTease');
  }
  papWork(): void {
    if (this.bus) sfx.papMotif(this.engine!.ctx, this.bus);
    this.note('papMotif');
  }
  drop(good = true): void {
    if (this.bus) sfx.dropChime(this.engine!.ctx, this.bus, good);
    this.note('dropChime');
  }
  buy(ok: boolean): void {
    if (this.bus) sfx.buyClick(this.engine!.ctx, this.bus, ok);
    this.note('buyClick');
  }
  powerOn(): void {
    if (this.bus) sfx.powerOnThunk(this.engine!.ctx, this.bus);
    this.note('powerOnThunk');
  }
  /** M15: the Lamp Man's sting — on the MASTER bus (it is not in the water,
   *  it is in your head, and it must not be muffled). */
  lampScare(): void {
    if (this.engine && this.engine.running) sfx.lampScare(this.engine.ctx, this.engine.master);
    this.note('lampScare');
  }
  /** M15.5: the cave inhales — the surge cue on the world bus (it IS the
   *  world; the water filter and silt muffle apply honestly). */
  undertowSurge(): void {
    if (this.bus) sfx.undertowSurge(this.engine!.ctx, this.bus);
    this.note('undertowSurge');
  }
  /** M15: the vortex — inhale whoosh + drag loop at the player's own ears. */
  vortexStart(): void {
    if (!this.bus) return;
    sfx.vortexGrab(this.engine!.ctx, this.bus);
    this.vortexStop?.();
    this.vortexStop = sfx.vortexDrag(this.engine!.ctx, this.bus);
    this.note('vortexStart');
  }
  vortexEnd(): void {
    this.vortexStop?.();
    this.vortexStop = null;
    this.note('vortexEnd');
  }

  // playMusic was retired at M12: every song now goes through the ONE music
  // slot (src/audio/music.ts) — the lull included.
}
