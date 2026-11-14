"""Generate local Cantonese demo audio with macOS's installed Sinji voice.
Run on macOS: python3 scripts/generate-cantonese-audio.py
"""
from pathlib import Path
import subprocess
import wave

output = Path(__file__).resolve().parents[1] / 'web/public/audio'
output.mkdir(parents=True, exist_ok=True)
for number, text in enumerate(('零','一','二','三','四','五','六','七','八','九','十')):
    path = output / f'{number}.wav'
    subprocess.run(['say', '-v', 'Sinji', '-o', str(path), '--data-format=LEI16@22050', text], check=True)
    with wave.open(str(path)) as audio:
        if audio.getnframes() == 0:
            raise RuntimeError(f'Empty audio: {path}. Run in a local macOS terminal with speech service access.')
        print(f'{number}: {audio.getnframes() / audio.getframerate():.2f}s')
