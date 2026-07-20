# The jukebox folder

Wind all three toy divers and the rec-room jukebox plays **one random track
from this folder**, game-wide, through the underwater filter. Once per run.

**Drop any `.mp3` / `.ogg` / `.wav` / `.m4a` in here — no code changes.**
The dev server lists the folder live; `npm run build` snapshots the listing
into `tracks.json`.

- `placeholder-music-box.wav` — a synthesized stand-in so the mechanic works
  today. Delete it once a real track lives here.
- The intended anthem is **"Still on Shift"** (style prompt + full lyrics in
  `LORE.md §6`). `node scripts/generate-vo.mjs` attempts it via Eleven Music
  once a valid `ELEVENLABS_API_KEY` is in `.env` — or paste the LORE prompt
  into Suno and drop the result in here.
