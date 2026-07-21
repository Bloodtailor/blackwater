// The Concept Gallery (DESIGN §12.1, LORE §7.1): C1–C12 concept paintings of
// the game itself, browsable from the title and pause menus. META on purpose —
// these live only in menus, never in the world, so they carry no diegetic
// burden. v1 ships the section unlocked by default (user 2026-07-21); the
// future encountered-subjects gate is documented in DESIGN §12.1, not built.
//
// Art source: public/images/concept/manifest.json written by
// scripts/generate-concept.mjs (Gemini). Any piece without a generated file
// shows a procedural FILM UNDEVELOPED frame — the gallery never blocks on
// generation (the LORE §7 fallback rule, applied to meta art too).

export interface ConceptPiece {
  id: string;
  title: string;
  /** Served PNG, or null → the undeveloped frame. */
  url: string | null;
}

/** LORE §7.1 manifest order — the section renders even with no manifest. */
const PIECES: [string, string][] = [
  ['c1', 'The Camp'],
  ['c2', 'First Descent'],
  ['c3', 'The Galleries'],
  ['c4', 'The Drowned'],
  ['c5', 'The Maze'],
  ['c6', 'The Angler'],
  ['c7', 'The Lamp Man'],
  ['c8', 'The Bore'],
  ['c9', 'The Guardians'],
  ['c10', 'The Heart'],
  ['c11', 'The Ascent'],
  ['c12', 'The Annex'],
];

class ConceptGallery {
  readonly pieces: ConceptPiece[] = PIECES.map(([id, title]) => ({ id, title, url: null }));
  /** Fires after the manifest loads so an open menu can re-render. */
  onLoaded: (() => void) | null = null;
  private frames = new Map<string, string>();

  async init(): Promise<void> {
    try {
      const res = await fetch('/images/concept/manifest.json');
      if (!res.ok) return;
      const j = (await res.json()) as Record<string, { title?: string; url?: string | null }>;
      for (const p of this.pieces) {
        const e = j[p.id];
        if (e) {
          p.url = e.url ?? null;
          if (e.title) p.title = e.title;
        }
      }
      this.onLoaded?.();
    } catch {
      // no manifest — every frame stays undeveloped
    }
  }

  /** Display URL for a piece: the painting, or its FILM UNDEVELOPED frame. */
  frameUrl(p: ConceptPiece): string {
    if (p.url) return p.url;
    let f = this.frames.get(p.id);
    if (!f) {
      f = undevelopedFrame(p.title);
      this.frames.set(p.id, f);
    }
    return f;
  }
}

/** A dark film-frame placeholder: sprocket holes, stencil, one title. */
function undevelopedFrame(title: string): string {
  const w = 640;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#07090a';
  g.fillRect(0, 0, w, h);
  // faint chemical blotching so the frame reads as stock, not a bug
  for (let i = 0; i < 40; i++) {
    const r = 20 + Math.random() * 90;
    const grad = g.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, r);
    grad.addColorStop(0, 'rgba(24, 34, 32, 0.10)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  // sprocket strips
  g.fillStyle = '#0d1113';
  g.fillRect(0, 0, w, 26);
  g.fillRect(0, h - 26, w, 26);
  g.fillStyle = '#020303';
  for (let x = 14; x < w; x += 34) {
    g.fillRect(x, 7, 16, 12);
    g.fillRect(x, h - 19, 16, 12);
  }
  g.strokeStyle = '#1c2a27';
  g.strokeRect(6.5, 32.5, w - 13, h - 65);
  g.textAlign = 'center';
  g.fillStyle = '#3d5a52';
  g.font = '700 30px "Courier New", monospace';
  g.fillText('FILM UNDEVELOPED', w / 2, h / 2 - 12);
  g.font = '400 16px "Courier New", monospace';
  g.fillStyle = '#2c433d';
  g.fillText(`— ${title.toUpperCase()} —`, w / 2, h / 2 + 22);
  g.fillText('AWAITING PROCESSING', w / 2, h / 2 + 48);
  return c.toDataURL('image/png');
}

export const CONCEPT = new ConceptGallery();
