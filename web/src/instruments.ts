const sharpNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flatNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const sharpTonics = new Set([0, 2, 4, 6, 7, 9, 11]);
function pitchNames(semitones: number) {
  const tonic = ((semitones % 12) + 12) % 12;
  const flats = semitones < 0 && tonic === 6;
  return !flats && sharpTonics.has(tonic) ? sharpNames : flatNames;
}
function spell(midi: number, semitones: number) {
  return pitchNames(semitones)[((midi % 12) + 12) % 12];
}
const degrees = [
  { digit: '1', step: 0 },
  { digit: '2', step: 2 },
  { digit: '3', step: 4 },
  { digit: '4', step: 5 },
  { digit: '5', step: 7 },
  { digit: '6', step: 9 },
  { digit: '7', step: 11 },
] as const;

export const chordQualities = [
  { id: 'major', label: 'Major', symbol: '', intervals: [0, 4, 7] },
  { id: 'minor', label: 'Minor', symbol: 'm', intervals: [0, 3, 7] },
  { id: 'diminished', label: 'Diminished', symbol: 'dim', intervals: [0, 3, 6] },
  { id: 'augmented', label: 'Augmented', symbol: 'aug', intervals: [0, 4, 8] },
  { id: 'dominant7', label: 'Dominant 7', symbol: '7', intervals: [0, 4, 7, 10] },
  { id: 'major7', label: 'Major 7', symbol: 'maj7', intervals: [0, 4, 7, 11] },
  { id: 'minor7', label: 'Minor 7', symbol: 'm7', intervals: [0, 3, 7, 10] },
  { id: 'half-diminished', label: 'Half-diminished', symbol: 'm7b5', intervals: [0, 3, 6, 10] },
  { id: 'diminished7', label: 'Diminished 7', symbol: 'dim7', intervals: [0, 3, 6, 9] },
] as const;

export type ChordQuality = typeof chordQualities[number]['id'];
const defaultQualities: Record<string, ChordQuality> = {
  '1': 'major', '2': 'minor', '3': 'minor', '4': 'major', '5': 'major', '6': 'minor', '7': 'diminished',
};

export const chordDigits = degrees.map(degree => degree.digit);
export const chordOctaves = [2, 3, 4, 5] as const;
export const defaultChordOctave = 3;
export const defaultChordQuality = (digit: string): ChordQuality => defaultQualities[digit] ?? 'major';
function voice(root: number, intervals: readonly number[]) {
  if (intervals.length <= 3) return intervals.map(interval => root + interval);
  const flatFifth = intervals.includes(6);
  const omit = flatFifth && intervals.includes(10) ? 3 : (flatFifth ? 6 : 7);
  return intervals.filter(interval => interval !== omit).map(interval => root + interval);
}
export function chordForDegree(digit: string, octave = defaultChordOctave, qualityId: string = defaultChordQuality(digit)) {
  const degree = degrees.find(item => item.digit === digit);
  const quality = chordQualities.find(item => item.id === qualityId) ?? chordQualities[0];
  if (!degree) return;
  const root = (octave + 1) * 12 + degree.step;
  const letter = spell(root, 0);
  return {
    name: letter + quality.symbol,
    letter,
    midi: voice(root, quality.intervals),
  };
}

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
] as const;

const releaseSeconds = .09;
const pedalSeconds = 2.6;
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
  accompaniment: {
    name: 'Chords',
    attack: .018,
    duration: pedalSeconds,
    partials: [{ ratio: 1, level: .54, decay: 1 }, { ratio: 2.002, level: .24, decay: .64 },
      { ratio: 3.008, level: .14, decay: .42 }, { ratio: 4.016, level: .08, decay: .22 }],
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

type Layer = { gain: GainNode; oscillators: OscillatorNode[]; timer?: number; chord?: string; startedAt?: number };

export class InstrumentPlayer {
  private context?: AudioContext;
  private melody?: Layer;
  private pad?: Layer;

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
    this.release(this.melody, releaseSeconds);
    this.release(this.pad, .45);
    this.melody = undefined;
    this.pad = undefined;
  }

  play(note: Note, instrument: Timbre) {
    if (note.midi === null) {
      this.stop();
      return true;
    }
    if (!this.context || this.context.state !== 'running') return false;
    this.stop();
    this.melody = this.startVoice(note.midi, instrument, timbres[instrument].duration, .24);
    return true;
  }

  playChord(chord: { name: string; midi: number[] }) {
    if (!this.context || this.context.state !== 'running') return false;
    this.release(this.melody, .2);
    this.melody = undefined;
    const previous = this.pad;
    this.pad = this.startChord(chord);
    this.release(previous, .22);
    return true;
  }

  private startVoice(midi: number, instrument: Timbre, duration: number, level: number) {
    const layer = this.layer(level);
    this.strike(layer, midiFrequency(midi), instrument, duration);
    this.arm(layer, duration);
    return layer;
  }

  private startChord(chord: { name: string; midi: number[] }) {
    const layer = this.layer(.22);
    layer.chord = chord.name;
    layer.startedAt = this.context!.currentTime;
    for (const midi of chord.midi) this.strike(layer, midiFrequency(midi), 'piano', pedalSeconds, .62);
    this.arm(layer, pedalSeconds);
    return layer;
  }

  private strike(layer: Layer, frequency: number, instrument: Timbre, duration: number, scale = 1) {
    const context = this.context!;
    const preset = timbres[instrument];
    const start = context.currentTime;
    for (const { ratio, level, decay } of preset.partials) {
      const envelope = context.createGain();
      const ring = duration * decay;
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(level * scale, start + preset.attack);
      if (instrument === 'flute') envelope.gain.linearRampToValueAtTime(.62 * level * scale, start + .40);
      else envelope.gain.exponentialRampToValueAtTime(Math.max(.08 * level * scale, .0001), start + ring * .62);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + Math.max(ring, preset.attack + .05));
      this.tone(layer, frequency * ratio, envelope);
    }
  }

  private layer(level: number) {
    const gain = this.context!.createGain();
    gain.gain.value = level;
    gain.connect(this.context!.destination);
    return { gain, oscillators: [] } as Layer;
  }

  private tone(layer: Layer, hz: number, envelope: GainNode) {
    const oscillator = this.context!.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = hz;
    oscillator.connect(envelope).connect(layer.gain);
    oscillator.start();
    layer.oscillators.push(oscillator);
  }

  private arm(layer: Layer, seconds: number) {
    layer.timer = window.setTimeout(() => {
      this.release(layer, .05);
      if (this.melody === layer) this.melody = undefined;
      if (this.pad === layer) this.pad = undefined;
    }, seconds * 1000);
  }

  private release(layer: Layer | undefined, seconds: number) {
    if (!layer || !this.context) return;
    if (layer.timer !== undefined) clearTimeout(layer.timer);
    const now = this.context.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(Math.max(layer.gain.gain.value, .0001), now);
    layer.gain.gain.linearRampToValueAtTime(.0001, now + seconds);
    const oscillators = layer.oscillators;
    const output = layer.gain;
    window.setTimeout(() => {
      for (const oscillator of oscillators) {
        try { oscillator.stop(); } catch { /* already stopped */ }
      }
      try { output.disconnect(); } catch { /* already disconnected */ }
    }, seconds * 1000 + 40);
  }
}
