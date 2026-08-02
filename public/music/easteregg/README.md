# The jukebox folder

Wind all three toy divers and the rec-room jukebox plays **one random track
from this folder**, game-wide, through the underwater filter. Once per run.

**Drop any `.mp3` / `.ogg` / `.wav` / `.m4a` in here — no code changes.**
The dev server lists the folder live; `npm run build` snapshots the listing
into `tracks.json`.

- The synthesized `placeholder-music-box.wav` stand-in is gone from the folder
  (2026-08-02): four real tracks live here now, and the placeholder was still
  in the shuffle. It is parked in `art-src/audio-unused/` — move it back and it
  is in the playlist again, no code changes.
- The intended anthem is **"Still on Shift"** (style prompt + full lyrics in
  `LORE.md §6`). `node scripts/generate-vo.mjs` attempts it via Eleven Music
  once a valid `ELEVENLABS_API_KEY` is in `.env` — or paste the LORE prompt
  into Suno and drop the result in here.
