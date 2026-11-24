const chords = {
  C: { name: 'C', midi: [48, 52, 55] },
  Dm: { name: 'Dm', midi: [50, 53, 57] },
  Em: { name: 'Em', midi: [52, 55, 59] },
  F: { name: 'F', midi: [53, 57, 60] },
  G: { name: 'G', midi: [55, 59, 62] },
  Am: { name: 'Am', midi: [57, 60, 64] },
  Bdim: { name: 'Bdim', midi: [59, 62, 65] },
} as const;

export const notes = [
  { digit: '0', name: 'Rest', pitch: '—', midi: null, chord: null },
  { digit: '1', name: 'Do', pitch: 'C4', midi: 60, chord: chords.C },
  { digit: '2', name: 'Re', pitch: 'D4', midi: 62, chord: chords.Dm },
  { digit: '3', name: 'Mi', pitch: 'E4', midi: 64, chord: chords.Em },
  { digit: '4', name: 'Fa', pitch: 'F4', midi: 65, chord: chords.F },
  { digit: '5', name: 'Sol', pitch: 'G4', midi: 67, chord: chords.G },
  { digit: '6', name: 'La', pitch: 'A4', midi: 69, chord: chords.Am },
  { digit: '7', name: 'Si', pitch: 'B4', midi: 71, chord: chords.Bdim },
  { digit: '8', name: 'Do', pitch: 'C5', midi: 72, chord: chords.C },
  { digit: '9', name: 'Re', pitch: 'D5', midi: 74, chord: chords.Dm },
] as const;

const releaseSeconds = .09;
const midiFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const timbres = {
  piano: {
    name: 'Piano',
    attack: .018,
    duration: .95,
    partials: [{ ratio: 1, level: .54, decay: 1 }, { ratio: 2.002, level: .24, decay: .64 },
      { ratio: 3.008, level: .14, decay: .42 }, { ratio: 4.016, level: .08, decay: .22 }],
  },
  guitar: {
    name: 'Guitar',
    attack: .014,
    duration: .65,
    partials: [{ ratio: 1, level: .49, decay: 1 }, { ratio: 2, level: .28, decay: .65 },
      { ratio: 3, level: .16, decay: .4 }, { ratio: 5, level: .07, decay: .22 }],
  },
  flute: {
    name: 'Flute',
    attack: .072,
    duration: .62,
    partials: [{ ratio: 1, level: .83, decay: 1 }, { ratio: 2, level: .12, decay: 1 },
      { ratio: 3, level: .05, decay: .83 }],
  },
} as const;

export type Timbre = keyof typeof timbres;
export const instrumentOptions = (Object.keys(timbres) as Timbre[]).map(id => ({ id, name: timbres[id].name }));
export type Note = typeof notes[number];
export const noteForDigit = (digit: string) => notes.find(note => note.digit === digit);

export class InstrumentPlayer {
  private context?: AudioContext;
  private active?: GainNode;

  async enable() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state !== 'running') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  stop() {
    const voice = this.active;
    if (!voice || !this.context) return;
    const time = this.context.currentTime;
    voice.gain.setValueAtTime(voice.gain.value, time);
    voice.gain.linearRampToValueAtTime(0, time + releaseSeconds);
    this.active = undefined;
  }

  play(note: Note, instrument: Timbre, withChord = false) {
    this.stop();
    const context = this.context;
    if (note.midi === null) return true;
    if (!context || context.state !== 'running') return false;

    const preset = timbres[instrument];
    const start = context.currentTime;
    const end = start + preset.duration;
    const frequency = midiFrequency(note.midi);
    const chord = withChord ? note.chord : null;
    const voice = context.createGain();
    voice.gain.value = .28;
    voice.connect(context.destination);
    this.active = voice;

    let remaining = preset.partials.length + (chord?.midi.length ?? 0);
    const addTone = (hz: number, scheduleEnvelope: (gain: AudioParam) => void) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;
      envelope.gain.setValueAtTime(.0001, start);
      scheduleEnvelope(envelope.gain);
      oscillator.connect(envelope).connect(voice);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        if (--remaining === 0) {
          voice.disconnect();
          if (this.active === voice) this.active = undefined;
        }
      };
      oscillator.start(start);
      oscillator.stop(end);
    };

    for (const { ratio, level, decay } of preset.partials) {
      addTone(frequency * ratio, gain => {
        gain.exponentialRampToValueAtTime(level, start + preset.attack);
        if (instrument === 'flute') {
          gain.linearRampToValueAtTime(.62 * level, start + .40);
        } else {
          // Keep a soft tail after the initial pluck or strike.
          gain.exponentialRampToValueAtTime(.08 * level, start + preset.duration * decay * .68);
        }
        gain.exponentialRampToValueAtTime(.0001, start + preset.duration * decay);
      });
    }
    for (const midi of chord?.midi ?? []) {
      addTone(midiFrequency(midi), gain => {
        gain.linearRampToValueAtTime(.075, start + .08);
        gain.linearRampToValueAtTime(.05, start + preset.duration * .55);
        gain.exponentialRampToValueAtTime(.0001, end);
      });
    }
    return true;
  }
}
