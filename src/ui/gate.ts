// The keyboard/mouse gate (web-deploy §3). BLACKWATER is pointer-lock + WASD:
// on a phone there is nothing to press and no way to look around, and a
// portfolio link lands on phones constantly. Rather than hand a visitor an
// unplayable canvas, we say so in the site's own voice — and still let them
// read what the thing is and look at it.
//
// The check is capability-first (no pointer lock = no game) with a touch-only
// heuristic behind it; a laptop with a touchscreen still gets the dive.

import { imageUrl } from '../game/media';

export function canPlay(): boolean {
  if (typeof document === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  if (params.has('anyway')) return true; // manual override
  if (params.has('gate')) return false; // force the gate (preview it anywhere)
  const hasPointerLock = 'requestPointerLock' in HTMLElement.prototype || 'pointerLockElement' in document;
  if (!hasPointerLock) return false;
  const coarseOnly = window.matchMedia?.('(pointer: coarse)').matches === true && window.matchMedia?.('(any-pointer: fine)').matches !== true;
  return !coarseOnly;
}

/** Full-screen "you need a keyboard" panel. Nothing else in the game boots. */
export function showDesktopGate(): void {
  const ui = document.getElementById('ui') ?? document.body;
  const wrap = document.createElement('div');
  wrap.id = 'gate';
  const art = document.createElement('div');
  art.className = 'gate-art';
  art.style.backgroundImage = `url(${imageUrl('g2')})`;
  wrap.appendChild(art);
  const card = document.createElement('div');
  card.className = 'gate-card';
  card.innerHTML = `
    <div class="gate-title">BLACKWATER</div>
    <div class="gate-sub">a recovery, in forty-one parts</div>
    <p><b>This dive needs a keyboard and a mouse.</b> The site is 1968, the water is
    140 metres deep, and the whole thing is played with WASD and a pointer the browser
    locks to the screen — neither of which your device has to hand.</p>
    <p>Come back on a desktop or laptop and the cenote is waiting. In the meantime,
    here is what is down there.</p>`;
  wrap.appendChild(card);
  const strip = document.createElement('div');
  strip.className = 'gate-strip';
  for (const id of ['g2', 'g10', 'g3', 'g11', 'g7', 'g12-sign']) {
    const img = document.createElement('img');
    img.src = imageUrl(id);
    img.loading = 'lazy';
    img.alt = '';
    strip.appendChild(img);
  }
  wrap.appendChild(strip);
  const more = document.createElement('div');
  more.className = 'gate-card';
  more.innerHTML = `
    <p><b>What it is.</b> A first-person survival dive built on a data-driven cave: rooms and
    tunnels live in one JSON graph and a signed-distance field carves real rock around them.
    Air is the clock — your heart rate spends it, and every light down there is information,
    yours and everything else's.</p>
    <p><b>What ships with it.</b> A level editor, a debug harness, a live tuning panel for
    every gameplay number, and a map viewer that checks the layout rules. They are part of the
    work, so they are part of the build — on a desktop, the title screen has a
    <b>DEVELOPER TOOLS</b> door.</p>
    <p class="gate-fine">If you are on a desktop and reading this anyway, your browser reports no
    pointer lock. You can force the dive with <code>?anyway=1</code>.</p>`;
  wrap.appendChild(more);
  ui.appendChild(wrap);
}
