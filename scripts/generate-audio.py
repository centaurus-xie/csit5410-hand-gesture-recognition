"""Generate three offline number voice packs using installed macOS voices."""
from pathlib import Path
import subprocess
import wave
import json

root = Path(__file__).resolve().parents[1] / 'web/public/audio'
chinese = ('零','一','二','三','四','五','六','七','八','九','十')
packs = {'yue': ('Sinji', chinese), 'en': ('Samantha', ('zero','one','two','three','four','five','six','seven','eight','nine','ten')), 'zh': ('Tingting', chinese)}
for language, (voice, words) in packs.items():
    folder = root / language
    folder.mkdir(parents=True, exist_ok=True)
    for number, text in enumerate(words):
        path = folder / f'{number}.wav'
        subprocess.run(['say','-v',voice,'-o',str(path),'--data-format=LEI16@22050',text],check=True)
        with wave.open(str(path)) as audio:
            if not audio.getnframes(): raise RuntimeError(f'Empty audio: {path}')
    print(f'{language}: 11 nonempty audio files',flush=True)
(root/'voices.json').write_text(json.dumps({k:{'voice':v[0],'labels':list(range(11))} for k,v in packs.items()},indent=2))
