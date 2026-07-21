// ONE VOICE (M12, DESIGN §14): a single global speech slot shared by the
// tapes, Lowe, and REMORA — two voices can never overlap, because everything
// the player hears as speech lives in the same head. Pure logic, unit-tested.
//
// Priority: a playing tape blocks both voices outright. Between the two
// voices, whoever holds the higher-priority head-of-queue line goes first
// (tapeReact > event > ambient); ties break toward Lowe (it's his head).

import type { VoCategory } from './lines';

const CAT_RANK: Record<VoCategory, number> = { tapeReact: 0, event: 1, ambient: 2 };

export interface SpeakerView {
  /** Currently speaking? (queue.current !== null) */
  speaking: boolean;
  /** Category of the next queued line, if any. */
  next: VoCategory | null;
}

export interface SpeechDecision {
  loweBlocked: boolean;
  remoraBlocked: boolean;
}

/**
 * Decide who may START a line this tick. Someone already mid-line keeps the
 * slot until they finish (no barging — a line, once started, is never talked
 * over). Call every tick BEFORE the queues' update().
 */
export function arbitrate(tapePlaying: boolean, lowe: SpeakerView, remora: SpeakerView): SpeechDecision {
  // a tape owns the slot completely
  if (tapePlaying) return { loweBlocked: true, remoraBlocked: true };
  // an active speaker keeps it
  if (lowe.speaking) return { loweBlocked: false, remoraBlocked: true };
  if (remora.speaking) return { loweBlocked: true, remoraBlocked: false };
  // slot free: the better head-of-queue line goes; the other waits a tick
  if (lowe.next === null && remora.next === null) return { loweBlocked: false, remoraBlocked: false };
  if (lowe.next === null) return { loweBlocked: true, remoraBlocked: false };
  if (remora.next === null) return { loweBlocked: false, remoraBlocked: true };
  const loweFirst = CAT_RANK[lowe.next] <= CAT_RANK[remora.next];
  return { loweBlocked: !loweFirst, remoraBlocked: loweFirst };
}
