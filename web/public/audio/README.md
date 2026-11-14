# Offline voice packs

Run `npm run audio:generate` on macOS to generate 33 WAV files (0–10):

- `yue/`: Cantonese, Sinji
- `en/`: English, Samantha
- `zh/`: Mandarin, Tingting

The UI remembers the chosen language and provides a preview. Both speech modes use the same selected pack. No API or network speech service is required. Missing audio produces a visible error; it is never replaced by a different language.

Files are generated locally and ignored by Git. Teammates on other operating systems can use copies of these WAV packs. Listen before presentation. Review system voice terms before public redistribution. Legacy `generate-cantonese-audio.py` produces the old flat directory layout; use `generate-audio.py` for the current UI.
