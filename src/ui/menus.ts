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
import { MUSIC } from '../audio/music';
import { TAPES } from '../audio/lines';
import { uiClick, uiHover } from './uisfx';
import { assetUrl } from '../util/persist';

type Screen = 'title' | 'jobsheet' | 'pause' | 'settings' | 'howto' | 'concept' | 'devtools' | null;

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
  'Nothing is for sale — the site issues FREE, one pull per man per bell. Dynamite, keys, and fuel slugs are FOUND below; they open the way down.',
  'Bring the warm thing back to daylight. Once lifted: ASCEND.',
];

// The key legend (user 2026-08-02). It used to be a permanent strip across the
// bottom of the HUD, where it covered the air bar and the weapon readout — it
// lives in the menus now: on the pause screen, and on HOW TO DIVE so the title
// screen can reach it too. One list, rendered in both places.
const CONTROLS: [string, string][] = [
  ['WASD', 'swim'],
  ['SPACE / C', 'up · down'],
  ['SHIFT', 'sprint'],
  ['Q / E', 'roll the camera'],
  ['LMB', 'fire'],
  ['RMB / V', 'knife'],
  ['R', 'reload'],
  ['1 / 2 / 3', 'swap weapon'],
  ['E', 'interact · take'],
  ['CTRL', 'grab the wall'],
  ['F', 'lamp'],
  ['G', 'toss a chemlight'],
  ['T', 'line: lay / fork — hold to ride'],
  ['X', 'line: tie / cut — hold to reel in'],
  ['ESC', 'pause'],
  ['F1 / `', 'debug panel'],
];

export class Menus {
  screen: Screen = null;
  private root: HTMLElement;
  private from: 'title' | 'pause' = 'title';
  private jobSheetSeen = false;
  private lastHover: HTMLElement | null = null;
  private fadeTimer: number | null = null;

  constructor(private hooks: MenuHooks) {
    this.root = document.createElement('div');
    this.root.id = 'menus';
    // start HIDDEN: #menus is a fullscreen wash — without this class a run
    // that never calls show() (editor ▶ TEST playtest) sat behind an
    // invisible click-eating overlay (user bug 2026-07-20)
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
    // UI sounds (user 2026-07-21): delegation catches EVERY menu control —
    // buttons, tape rows, gallery tiles, the job-sheet sign line — including
    // ones future screens add. Hover ticks only on real buttons.
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, .menu-tile, .gallery-tile, input, select')) uiClick();
    });
    this.root.addEventListener(
      'mouseover',
      (e) => {
        const t = e.target as HTMLElement | null;
        const b = t?.closest('button');
        if (b && b !== this.lastHover) {
          this.lastHover = b;
          uiHover();
        }
      },
      true,
    );
    this.root.addEventListener('mouseout', () => (this.lastHover = null));
    window.addEventListener('keydown', (e) => {
      if (this.screen === 'jobsheet' && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) this.dive();
      else if (this.screen === 'settings' || this.screen === 'howto' || this.screen === 'concept') {
        if (e.code === 'Escape') this.show(this.from === 'title' ? 'title' : 'pause');
      } else if (this.screen === 'devtools') {
        if (e.code === 'Escape') this.show('title');
      }
    });
    // concept manifest loads async — refresh an open gallery when it lands
    CONCEPT.onLoaded = () => {
      if (this.screen === 'concept') this.render();
    };
    void CONCEPT.init();
    // a game song ending while a menu is up hands the slot to the theme
    MUSIC.onStopped = () => {
      if (this.blocking) this.syncMusic();
    };
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
  // Missing file = silence; autoplay-block = first click/key retries.
  // M12 ONE-SONG rule: the theme YIELDS to any game song still playing
  // (a paused jukebox evening, Moonlight under the win screen) and starts
  // only when that song ends — MUSIC.onStopped re-syncs us. ──
  private musicEl: HTMLAudioElement | null = null;

  /** The theme never hard-cuts (user 2026-07-21): leaving a menu — RESUME,
   *  the job-sheet signature — fades it out over ~1.2 s. */
  private fadeOutTheme(): void {
    const el = this.musicEl;
    if (!el || el.paused) return;
    if (this.fadeTimer !== null) return; // already fading
    const step = el.volume / 24;
    this.fadeTimer = window.setInterval(() => {
      if (el.volume > step) el.volume = Math.max(0, el.volume - step);
      else {
        el.pause();
        if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, 50);
  }

  private syncMusic(): void {
    if (this.screen === null || MUSIC.playing) {
      this.fadeOutTheme();
      return;
    }
    if (!this.musicEl) {
      this.musicEl = new Audio(assetUrl('/music/menu-theme.mp3'));
      this.musicEl.loop = true;
    }
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer); // cancel a fade — the menu is back
      this.fadeTimer = null;
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

  /** The key legend, as a two-column list. Lives in the menus only. */
  private appendControls(wrap: HTMLElement): void {
    const box = document.createElement('div');
    box.className = 'menu-keys';
    const head = document.createElement('div');
    head.className = 'menu-sub mk-head';
    head.textContent = 'CONTROLS';
    box.appendChild(head);
    for (const [key, what] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'mk-row';
      const k = document.createElement('span');
      k.className = 'mk-key';
      k.textContent = key;
      const w = document.createElement('span');
      w.className = 'mk-what';
      w.textContent = what;
      row.append(k, w);
      box.appendChild(row);
    }
    wrap.appendChild(box);
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
      // The toolkit is a FEATURE of this build, not a back door (web-deploy
      // §1): the editor and the panels ship public and get a front door.
      btn('DEVELOPER TOOLS', () => {
        this.from = 'title';
        this.show('devtools');
      });
      btn('SETTINGS', () => {
        this.from = 'title';
        this.show('settings');
      });
      return;
    }

    if (this.screen === 'devtools') {
      const h = document.createElement('div');
      h.className = 'menu-title small';
      h.textContent = 'DEVELOPER TOOLS';
      wrap.appendChild(h);
      const sub = document.createElement('div');
      sub.className = 'menu-sub';
      sub.textContent = 'the tools this game was built with — they ship with it';
      wrap.appendChild(sub);
      const body = document.createElement('div');
      body.className = 'menu-devtools';
      body.innerHTML = `
        <p>BLACKWATER's cave is data, not geometry hand-placed in code: a graph of rooms and
        tunnels in <code>layout.json</code>, carved into rock by a signed-distance field at load.
        Everything below was built alongside the game to keep that honest — and it is all here,
        in the public build.</p>
        <p><b>Level editor</b> — orbit the graph, drag rooms and tunnels, tilt a room so it lies
        about which way is up, set water levels, then play the unsaved layout instantly. It runs
        the design rules as you edit (two routes to every zone, air reachable on one breath) and
        tells you when you have broken one.</p>
        <p><b>Debug panel</b> — teleport, spawn, give weapons and perks, force a silt-out, freeze
        the shift clock. Every feature in this game shipped with its own trigger here in the same
        session; a thing I cannot reach in ten seconds is a thing I never verified.</p>
        <p><b>Tuning panel</b> — all ~420 gameplay numbers, live, each with the comment from
        <code>tuning.ts</code> as its description. Change how fast the Drowned swim while they are
        swimming at you.</p>
        <p><b>Map viewer</b> — the graph as a labeled wireframe plus top and side projections,
        with the layout rules checked and reported.</p>`;
      wrap.appendChild(body);
      const keys = document.createElement('div');
      keys.className = 'menu-keys';
      const kh = document.createElement('div');
      kh.className = 'menu-sub mk-head';
      kh.textContent = 'GETTING IN';
      keys.appendChild(kh);
      for (const [k, what] of [
        ['F1 / `', 'debug + tuning panel (any screen)'],
        ['H', 'hide the debug layer · frees the mouse'],
        ['N', 'noclip survey — needs the panel open'],
        ['?edit', 'the level editor'],
        ['?view=map', 'the map viewer'],
        ['?debug', 'start with the panel already up'],
      ] as [string, string][]) {
        const row = document.createElement('div');
        row.className = 'mk-row';
        const kk = document.createElement('span');
        kk.className = 'mk-key';
        kk.textContent = k;
        const w = document.createElement('span');
        w.className = 'mk-what';
        w.textContent = what;
        row.append(kk, w);
        keys.appendChild(row);
      }
      wrap.appendChild(keys);
      const ed = document.createElement('div');
      ed.className = 'menu-devtools';
      ed.innerHTML = `<p><b>In the editor:</b> click a room to select · drag the gizmo to move ·
        <code>R</code> orient (tilts falseUp and the water with it) · <code>W</code> water level ·
        shift-click a second room to dig a tunnel · double-click a tunnel to add a waypoint ·
        <code>DEL</code> delete · <code>F</code> frame · <code>ctrl+Z</code> undo · ▶ TEST plays
        the unsaved layout · <code>F4</code> brings you back.</p>`;
      wrap.appendChild(ed);
      btn('OPEN THE LEVEL EDITOR', () => {
        location.search = '?edit=1';
      }, 'primary');
      btn('OPEN THE MAP VIEWER', () => {
        location.search = '?view=map';
      });
      btn('BACK', () => this.show('title'));
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
      this.appendControls(wrap);
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
      this.appendControls(wrap);
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
