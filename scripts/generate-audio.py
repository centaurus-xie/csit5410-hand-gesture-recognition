"""Generate three offline number voice packs using installed macOS voices."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import wave
import json

root = Path(__file__).resolve().parents[1] / 'web/public/audio'
chinese = ('零','一','二','三','四','五','六','七','八','九','十')
packs = {'yue': ('Sinji', chinese), 'en': ('Samantha', ('zero','one','two','three','four','five','six','seven','eight','nine','ten')), 'zh': ('Tingting', chinese)}
phrases = {'yue': '多謝，下次見！', 'en': 'Thank you. See you next time!', 'zh': '谢谢，下次见！'}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--phrase-only', action='store_true', help='Generate only the sign demo sentence')
args = parser.parse_args()
for language, (voice, words) in packs.items():
    folder = root / language
    folder.mkdir(parents=True, exist_ok=True)
    entries = [] if args.phrase_only else list(enumerate(words))
    entries.append(('thanks-see-you', phrases[language]))
    with TemporaryDirectory(dir=folder) as temporary:
        for label, text in entries:
            path = Path(temporary) / f'{label}.wav'
            subprocess.run(['say', '-v', voice, '-o', str(path), '--data-format=LEI16@22050', text], check=True)
            with wave.open(str(path)) as audio:
                if not audio.getnframes():
                    raise RuntimeError(f'No audio for {language}/{label}. Run in the macOS Terminal.')
        for label, _ in entries:
            (Path(temporary) / f'{label}.wav').replace(folder / f'{label}.wav')
    print(f'{language}: {len(entries)} audio files', flush=True)
if not args.phrase_only:
    (root / 'voices.json').write_text(json.dumps({k:{'voice':v[0],'labels':list(range(11))} for k,v in packs.items()},indent=2))
