// Menus (M8c, DESIGN §12): title → job sheet → dive; Esc (pointer-lock loss)
// → pause with the recovered-tapes list; settings + How to Dive reachable
// from both. The world keeps rendering behind a dark wash — the animation
// loop gates tick() on menus.blocking, so the run truly freezes (the harness
// drives tick directly and is unaffected).
//
// The job sheet card IS the objective delivery (LORE §2.3, verbatim, with
// the impossible 1971 enclosure as a real thumbnail — the same image the
// player later finds pinned at the drill head).

import { TUNING, setTuningValue } from '../tuning';
import { SETTINGS, saveSettings } from './settings';
import { imageUrl } from '../game/media';
import { GALLERY } from '../game/gallery';
import { CONCEPT } from '../game/concept';
import { TAPES } from '../audio/lines';

type Screen = 'title' | 'jobsheet' | 'pause' | 'settings' | 'howto' | 'concept' | null;

export interface MenuHooks {
  /** Click-to-play side effects (pointer lock; fullscreen; audio wake). */
  engage(): void;
  restart(): void;
  replayTape(id: string): void;
  collectedTapes(): string[];
  /** Volume/duck hook (menus duck the mix while open). */
  setDucked(on: boolean): void;
  applyDisplay(): void; // fov + brightness changed
}

const HOWTO = [
  'AIR is the clock. Heart rate spends it — swim calm, live long.',
  'Surface or any air pocket refills the tank. The reserve breath is your last.',
  'Your BUBBLES always rise toward the surface. The gauge never lies.',
  'T lays and rides your guide LINE. X ties it off and reels it in.',
  'G tosses a CHEMLIGHT. Mark what you have cleared.',
  'Pale chalk COLUMNS detonate on touch or gunfire: instant silt-out.',
  'Swim slow near silty floors. Speed stirs the water blind.',
  'LIGHT is information — yours, and everything else’s. F toggles it.',
  'Points buy doors, guns, draughts. Everything worth buying is deeper.',
  'Bring the warm thing back to daylight. Once lifted: ASCEND.',
];

export class Menus {
  screen: Screen = null;
  private root: HTMLElement;
  private from: 'title' | 'pause' = 'title';
  private jobSheetSeen = false;

  constructor(private hooks: MenuHooks) {
    this.root = document.createElement('div');
    this.root.id = 'menus';
    // start HIDDEN: #menus is a fullscreen wash — without this class a run
    // that never calls show() (editor ▶ TEST playtest) sat behind an
    // invisible click-eating overlay (user bug 2026-07-20)
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.screen === 'jobsheet' && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) this.dive();
      else if (this.screen === 'settings' || this.screen === 'howto' || this.screen === 'concept') {
        if (e.code === 'Escape') this.show(this.from === 'title' ? 'title' : 'pause');
      }
    });
    // concept manifest loads async — refresh an open gallery when it lands
    CONCEPT.onLoaded = () => {
      if (this.screen === 'concept') this.render();
    };
    void CONCEPT.init();
  }

  get blocking(): boolean {
    return this.screen !== null;
  }

  show(screen: Screen): void {
    this.screen = screen;
    this.hooks.setDucked(screen !== null);
    this.render();
    this.syncMusic();
  }

  // ── menu music (user 2026-07-20): the menus carry their own theme —
  // a plain looped element, outside the game's buses (the run is frozen).
  // Missing file = silence; autoplay-block = first click/key retries. ──
  private musicEl: HTMLAudioElement | null = null;
  private syncMusic(): void {
    if (this.screen === null) {
      this.musicEl?.pause();
      return;
    }
    if (!this.musicEl) {
      this.musicEl = new Audio('/music/menu-theme.mp3');
      this.musicEl.loop = true;
    }
    this.musicEl.volume = Math.min(1, Math.max(0, SETTINGS.volumeMaster * SETTINGS.volumeMusic * 0.8));
    void this.musicEl.play().catch(() => {
      const retry = (): void => {
        if (this.blocking) void this.musicEl?.play().catch(() => {});
      };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('keydown', retry, { once: true });
    });
  }

  /** Pointer-lock loss during play = pause (unless something else owns the screen). */
  onUnlock(): void {
    if (this.screen === null) this.show('pause');
  }

  private dive(): void {
    if (!this.jobSheetSeen) {
      this.jobSheetSeen = true;
      this.show('jobsheet');
      return;
    }
    this.show(null);
    this.hooks.engage();
  }

  private render(): void {
    const r = this.root;
    r.textContent = '';
    r.className = this.screen === null ? 'hidden' : '';
    if (this.screen === null) return;
    const wrap = document.createElement('div');
    wrap.className = `menu-screen menu-${this.screen}`;
    r.appendChild(wrap);
    const btn = (label: string, fn: () => void, cls = ''): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `menu-btn ${cls}`;
      b.textContent = label;
      b.addEventListener('click', fn);
      wrap.appendChild(b);
      return b;
    };

    if (this.screen === 'title') {
      const art = document.createElement('div');
      art.className = 'menu-art';
      art.style.backgroundImage = `url(${imageUrl('g2')})`;
      wrap.appendChild(art);
      const patch = document.createElement('img');
      patch.className = 'menu-patch';
      patch.src = imageUrl('g1');
      wrap.appendChild(patch);
      const h = document.createElement('div');
      h.className = 'menu-title';
      h.textContent = 'BLACKWATER';
      wrap.appendChild(h);
      const sub = document.createElement('div');
      sub.className = 'menu-sub';
      sub.textContent = 'a recovery, in forty-one parts';
      wrap.appendChild(sub);
      btn(this.jobSheetSeen ? 'DIVE' : 'TAKE THE JOB', () => this.dive(), 'primary');
      btn('HOW TO DIVE', () => {
        this.from = 'title';
        this.show('howto');
      });
      btn('CONCEPT ART', () => {
        this.from = 'title';
        this.show('concept');
      });
      btn('SETTINGS', () => {
        this.from = 'title';
        this.show('settings');
      });
      return;
    }

    if (this.screen === 'concept') {
      // The Concept Gallery (DESIGN §12.1): meta on purpose, unlocked by
      // default (user 2026-07-21) — future encountered-subjects gate is
      // documented, not built. Missing pieces show FILM UNDEVELOPED.
      const h = document.createElement('div');
      h.className = 'menu-title small';
      h.textContent = 'CONCEPT ART';
      wrap.appendChild(h);
      const sub = document.createElement('div');
      sub.className = 'menu-sub';
      sub.textContent = 'site blackwater, as first imagined';
      wrap.appendChild(sub);
      const grid = document.createElement('div');
      grid.className = 'menu-concept-grid';
      for (const p of CONCEPT.pieces) {
        const tile = document.createElement('div');
        tile.className = 'menu-concept-tile';
        const img = document.createElement('img');
        img.src = CONCEPT.frameUrl(p);
        img.title = p.title;
        const cap = document.createElement('div');
        cap.textContent = p.title.toUpperCase();
        tile.append(img, cap);
        tile.addEventListener('click', () => {
          const box = document.createElement('div');
          box.className = 'menu-lightbox';
          const big = document.createElement('img');
          big.src = CONCEPT.frameUrl(p);
          const bcap = document.createElement('div');
          bcap.className = 'menu-sub';
          bcap.textContent = p.url ? p.title : `${p.title} — film undeveloped`;
          box.append(big, bcap);
          box.addEventListener('click', () => box.remove());
          this.root.appendChild(box);
        });
        grid.appendChild(tile);
      }
      wrap.appendChild(grid);
      btn('BACK', () => this.show(this.from === 'title' ? 'title' : 'pause'), 'primary');
      return;
    }

    if (this.screen === 'jobsheet') {
      const card = document.createElement('div');
      card.className = 'jobsheet';
      card.innerHTML = `
        <div class="js-head">RECOVERY ORDER — PRIVATE CLIENT <span>(through Merrin &amp; Slade, attorneys)</span></div>
        <div class="js-body">
          <p>Diver: V. Lowe, sole. Fee: $200,000 on attempt (cleared); $1,400,000 on completion.</p>
          <p>Item: THERMAL-1. Bottom of the bore, Site BLACKWATER (coordinates enclosed). Item is warm
          to the touch. Item is to be carried, not rigged, not bagged. Recover to open daylight.</p>
          <p>Conditions: Site lines are condemned — lay your own. Do not photograph the item.
          Do not correct the count. <b>Once the item is lifted it is not to be set down, cached,
          or sheltered with. Ascend.</b></p>
          <p class="js-enclosure">Enclosure: one (1) interior photograph of target chamber, print, processing stamp 1971.</p>
        </div>
        <div class="js-pencil">Stamp is three years after the water. Asked. No answer. Fee cleared anyway. — V.L.</div>`;
      const thumb = document.createElement('img');
      thumb.className = 'js-thumb';
      thumb.src = imageUrl('g13');
      card.querySelector('.js-enclosure')?.appendChild(thumb);
      wrap.appendChild(card);
      btn('SIGN IT — DIVE  (E)', () => this.dive(), 'primary');
      return;
    }

    if (this.screen === 'pause') {
      const h = document.createElement('div');
      h.className = 'menu-title small';
      h.textContent = 'SHIFT PAUSED';
      wrap.appendChild(h);
      btn('RESUME', () => {
        this.show(null);
        this.hooks.engage();
      }, 'primary');
      // recovered tapes: the replay list (LORE §5)
      const tapes = this.hooks.collectedTapes();
      const list = document.createElement('div');
      list.className = 'menu-tapes';
      const lh = document.createElement('div');
      lh.className = 'menu-sub';
      lh.textContent = tapes.length ? `RECOVERED TAPES — ${tapes.length} of ${TAPES.length} (click to replay)` : 'NO TAPES RECOVERED YET';
      list.appendChild(lh);
      for (const id of tapes) {
        const t = TAPES.find((t) => t.id === id)!;
        const b = document.createElement('button');
        b.className = 'menu-tape';
        b.textContent = `▶ ${t.title}`;
        b.addEventListener('click', () => {
          this.show(null);
          this.hooks.engage();
          this.hooks.replayTape(id);
        });
        list.appendChild(b);
      }
      wrap.appendChild(list);
      // photographs: everything inspected in the world + the toy polaroids
      // (user 2026-07-20) — click a thumbnail for the full print
      const shots = GALLERY.items;
      const gal = document.createElement('div');
      gal.className = 'menu-gallery';
      const gh = document.createElement('div');
      gh.className = 'menu-sub';
      gh.textContent = shots.length ? `PHOTOGRAPHS — ${shots.length} filed (click to view)` : 'NO PHOTOGRAPHS FILED YET — inspect what you find';
      gal.appendChild(gh);
      if (shots.length) {
        const grid = document.createElement('div');
        grid.className = 'menu-gallery-grid';
        for (const it of shots) {
          const img = document.createElement('img');
          img.src = it.url;
          img.title = it.title;
          img.addEventListener('click', () => {
            const box = document.createElement('div');
            box.className = 'menu-lightbox';
            const big = document.createElement('img');
            big.src = it.url;
            const cap = document.createElement('div');
            cap.className = 'menu-sub';
            cap.textContent = it.caption;
            box.append(big, cap);
            box.addEventListener('click', () => box.remove());
            this.root.appendChild(box);
          });
          grid.appendChild(img);
        }
        gal.appendChild(grid);
      }
      wrap.appendChild(gal);
      btn('CONCEPT ART', () => {
        this.from = 'pause';
        this.show('concept');
      });
      btn('SETTINGS', () => {
        this.from = 'pause';
        this.show('settings');
      });
      btn('HOW TO DIVE', () => {
        this.from = 'pause';
        this.show('howto');
      });
      btn('ABANDON — RESTART THE DIVE', () => this.hooks.restart());
      return;
    }

    if (this.screen === 'howto') {
      const h = document.createElement('div');
      h.className = 'menu-title small';
      h.textContent = 'HOW TO DIVE';
      wrap.appendChild(h);
      const ol = document.createElement('ol');
      ol.className = 'menu-howto';
      for (const l of HOWTO) {
        const li = document.createElement('li');
        li.textContent = l;
        ol.appendChild(li);
      }
      wrap.appendChild(ol);
      btn('BACK', () => this.show(this.from === 'title' ? 'title' : 'pause'), 'primary');
      return;
    }

    // settings
    const h = document.createElement('div');
    h.className = 'menu-title small';
    h.textContent = 'SETTINGS';
    wrap.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'menu-settings';
    wrap.appendChild(grid);
    const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): void => {
      const row = document.createElement('label');
      row.className = 'ms-row';
      const s = document.createElement('span');
      const val = document.createElement('em');
      const paint = (): void => {
        val.textContent = String(Math.round(get() * 100) / 100);
      };
      s.textContent = label;
      const i = document.createElement('input');
      i.type = 'range';
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      i.value = String(get());
      i.addEventListener('input', () => {
        set(Number(i.value));
        saveSettings();
        paint();
      });
      paint();
      row.append(s, i, val);
      grid.appendChild(row);
    };
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
      const row = document.createElement('label');
      row.className = 'ms-row';
      const s = document.createElement('span');
      s.textContent = label;
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.checked = get();
      i.addEventListener('change', () => {
        set(i.checked);
        saveSettings();
      });
      row.append(s, i);
      grid.appendChild(row);
    };
    slider('Mouse sensitivity', 0.2, 3, 0.05, () => SETTINGS.mouseSens, (v) => (SETTINGS.mouseSens = v));
    toggle('Invert Y', () => SETTINGS.invertY, (v) => (SETTINGS.invertY = v));
    slider('Field of view', 60, 100, 1, () => SETTINGS.fov, (v) => {
      SETTINGS.fov = v;
      this.hooks.applyDisplay();
    });
    slider('Brightness', 0.5, 1.6, 0.05, () => SETTINGS.brightness, (v) => {
      SETTINGS.brightness = v;
      this.hooks.applyDisplay();
    });
    slider('Max camera tilt ° (motion sickness — not difficulty)', 0, 180, 5, () => SETTINGS.maxTiltDeg, (v) => (SETTINGS.maxTiltDeg = v));
    slider('Master volume', 0, 1, 0.05, () => SETTINGS.volumeMaster, (v) => (SETTINGS.volumeMaster = v));
    slider('SFX volume', 0, 1.5, 0.05, () => TUNING.audio.sfxGain, (v) => setTuningValue('audio.sfxGain', v));
    slider('Music volume', 0, 1, 0.05, () => SETTINGS.volumeMusic, (v) => (SETTINGS.volumeMusic = v));
    slider('Voice volume', 0, 1, 0.05, () => SETTINGS.volumeVo, (v) => (SETTINGS.volumeVo = v));
    toggle('Subtitles', () => SETTINGS.subtitles, (v) => (SETTINGS.subtitles = v));
    toggle('Fullscreen on play (keeps Ctrl+W in the game)', () => SETTINGS.fullscreenOnPlay, (v) => (SETTINGS.fullscreenOnPlay = v));
    btn('BACK', () => this.show(this.from === 'title' ? 'title' : 'pause'), 'primary');
  }
}
