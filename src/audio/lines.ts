// Lowe's line list + the six tape scripts — VERBATIM from LORE.md §2.2/§5
// (locked; categories are load-bearing, exact lines are the fiction).
//
// The DATA lives in lines.json so scripts/generate-vo.mjs reads the exact
// same words the game subtitles — one source, no drift between the printed
// line and the voiced line. Priorities per LORE §2.1: tapeReact > event >
// ambient; every line at most once per run.

import DATA from './lines.json';

export type VoCategory = 'tapeReact' | 'event' | 'ambient';

export interface VoLine {
  id: string;
  cat: VoCategory;
  text: string;
  /** Forced lines (the win beat) skip the roll and the cooldown, never the
   *  surface rule. */
  forced?: boolean;
}

export interface TapeScript {
  id: string;
  title: string; // pickup toast + subtitle tag
  nodeId: string;
  text: string; // spoken content (subtitle)
  reactionId: string; // Lowe's queued line
  /** VO casting note for the generation script. */
  voice: string;
}

export const LOWE_LINES: VoLine[] = DATA.lowe as VoLine[];
export const TAPES: TapeScript[] = DATA.tapes as TapeScript[];

/** Subtitle pacing: rough seconds a line takes to say (fallback when no
 *  generated audio exists to measure). */
export function estimateSpeechSec(text: string): number {
  return Math.min(32, Math.max(2.2, text.length / 13));
}
