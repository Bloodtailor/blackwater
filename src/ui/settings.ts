// Settings stub (full menu lands in M8). The max-tilt cap ships NOW because
// it's an accessibility requirement (DESIGN §6.5), not a difficulty option —
// functional pre-menu via the debug panel slider, persisted across runs.

export interface Settings {
  maxTiltDeg: number; // 0–180 cap on camera roll; motion-sickness accessibility
}

const KEY = 'bw-settings';

const DEFAULTS: Settings = { maxTiltDeg: 180 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export const SETTINGS: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(SETTINGS));
  } catch {
    // storage unavailable (private mode) — settings just don't persist
  }
}
