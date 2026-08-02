// Saving without a dev server (web-deploy §2). The editor, the tuning panel
// and the screenshot key all wrote to disk through Vite middleware — routes
// that simply do not exist on a static host. Deployed as-is, a visitor builds
// a map, hits SAVE, and silently loses it.
//
// The rule here: in DEV keep the dev-server path exactly as it was (my own
// workflow is unchanged, and the repo files stay the source of truth); in
// PROD fall back to what a browser can actually do — localStorage for
// "it survives a reload", a real file download for "it survives everything".
// Nothing in a deployed build may fire a request at /__* and leave a 404 or
// an unhandled rejection in the console; that console is part of the work.

export const IS_DEV: boolean = import.meta.env.DEV;

/** Absolute-looking asset paths ('/audio/x.mp3') resolved against the deploy
 *  base (web-deploy §5). Root deploys are unchanged; under a subpath every
 *  manifest url, sample and track still points at the right file. */
export function assetUrl(p: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(p) || p.startsWith('data:') || p.startsWith('blob:')) return p;
  const base = import.meta.env.BASE_URL || '/';
  return base.replace(/\/$/, '') + '/' + p.replace(/^\//, '');
}

/** POST to a dev-server sink. In prod no request is made and this is false. */
export async function devPost(path: string, body: string): Promise<boolean> {
  if (!IS_DEV) return false;
  try {
    const res = await fetch(path, { method: 'POST', body });
    return res.ok;
  } catch {
    return false; // dev server gone (built preview, offline) — never throws
  }
}

/** Hand the user a real file. The only persistence a static host can promise. */
export function downloadFile(name: string, data: BlobPart, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Save a canvas as a PNG the browser downloads (prod screenshot path). */
export function downloadCanvas(canvas: HTMLCanvasElement, name: string): void {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.png') ? name : `${name}.png`;
  a.click();
}

/** Screenshot: dev-server sink while developing, download in the wild. */
export async function captureCanvas(canvas: HTMLCanvasElement, name: string): Promise<string> {
  if (IS_DEV) {
    const ok = await devPost(`/__shot?name=${encodeURIComponent(name)}`, canvas.toDataURL('image/png'));
    return `${name}: ${ok ? 'saved to docs/screens' : 'FAILED (dev server only)'}`;
  }
  downloadCanvas(canvas, name);
  return `${name}: downloaded`;
}

/** Open a file picker and read one text file. Resolves null if cancelled. */
export function pickTextFile(accept = 'application/json,.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    // a cancelled picker fires nothing in most browsers; the promise just
    // never settles, which is fine — nothing is awaiting a cancel
    input.click();
  });
}

/** localStorage that never throws (private mode, quota, disabled storage). */
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing to do — the value was never stored
    }
  },
};
