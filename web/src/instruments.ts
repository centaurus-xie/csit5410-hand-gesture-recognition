export const notes = [
  { digit: '0', name: 'Rest', pitch: '—', midi: null },
  { digit: '1', name: 'Do', pitch: 'C4', midi: 60 },
  { digit: '2', name: 'Re', pitch: 'D4', midi: 62 },
  { digit: '3', name: 'Mi', pitch: 'E4', midi: 64 },
  { digit: '4', name: 'Fa', pitch: 'F4', midi: 65 },
  { digit: '5', name: 'Sol', pitch: 'G4', midi: 67 },
  { digit: '6', name: 'La', pitch: 'A4', midi: 69 },
  { digit: '7', name: 'Si', pitch: 'B4', midi: 71 },
  { digit: '8', name: 'Do', pitch: 'C5', midi: 72 },
  { digit: '9', name: 'Re', pitch: 'D5', midi: 74 },
  { digit: '10', name: 'Mi', pitch: 'E5', midi: 76 },
] as const;

const timbres = {
  piano: {
    name: 'Piano',
    attack: .008,
    duration: .95,
    partials: [{ ratio: 1, level: .54, decay: 1 }, { ratio: 2.002, level: .24, decay: .64 },
      { ratio: 3.008, level: .14, decay: .42 }, { ratio: 4.016, level: .08, decay: .22 }],
  },
  guitar: {
    name: 'Guitar',
    attack: .006,
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
    voice.gain.setTargetAtTime(0, time, .006);
    this.active = undefined;
  }

  play(note: Note, instrument: Timbre) {
    this.stop();
    const context = this.context;
    if (note.midi === null) return true;
    if (!context || context.state !== 'running') return false;

    const preset = timbres[instrument];
    const start = context.currentTime;
    const end = start + preset.duration;
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    const voice = context.createGain();
    voice.gain.value = .28;
    voice.connect(context.destination);
    this.active = voice;

    let remaining = preset.partials.length;
    for (const { ratio, level, decay } of preset.partials) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * ratio;
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(level, start + preset.attack);
      if (instrument === 'flute') {
        envelope.gain.linearRampToValueAtTime(.62 * level, start + .40);
      }
      envelope.gain.exponentialRampToValueAtTime(.0001, start + preset.duration * decay);
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
    }
    return true;
  }
}
