// Settings stub (full menu lands in M8). The max-tilt cap ships NOW because
// it's an accessibility requirement (DESIGN §6.5), not a difficulty option —
// functional pre-menu via the debug panel slider, persisted across runs.

export interface Settings {
  maxTiltDeg: number; // 0–180 cap on camera roll; motion-sickness accessibility
  /** Enter fullscreen when you click to play. Required for the browser to
   *  hand Ctrl+W/R/T to the game instead of closing/refreshing the tab
   *  (Ctrl is the wall-grab key — user report 2026-07-19). */
  fullscreenOnPlay: boolean;
  /** Master volume 0..1 (M8a; per-family levels live in tuning.audio). */
  volumeMaster: number;
  /** Lowe + tapes volume 0..1 (M8b). */
  volumeVo: number;
  /** Jukebox / stinger-music volume 0..1 (M8b). */
  volumeMusic: number;
  /** Subtitles for VO and tapes (default ON — the fallback voice IS text). */
  subtitles: boolean;
}

const KEY = 'bw-settings';

const DEFAULTS: Settings = { maxTiltDeg: 180, fullscreenOnPlay: true, volumeMaster: 0.8, volumeVo: 1, volumeMusic: 1, subtitles: true };

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
