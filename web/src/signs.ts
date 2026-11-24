import { HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { features } from './features';
import { predict, validateNetwork, type Network } from './model';

const VERSION = 'single-hand-motion-v1';
const STEPS = 16;
const FRAME_SIZE = 22;
const SAMPLE_HZ = 12;
const MAX_SECONDS = 12;
export const signNames: Readonly<Record<string, string>> = {
  thank_you: '多謝', next_time: '下次', bye: '再見',
};
export const demoSequence = ['thank_you', 'next_time', 'bye'];

export type SignModel = Network & { feature_version: string; threshold: number };
export type MotionFrame = {
  time: number;
  hand: string;
  wrist: [number, number];
  palm_size: number;
  geometry: number[];
};

export function validateSignModel(value: unknown): SignModel {
  const model = value as SignModel;
  if (model?.feature_version !== VERSION) throw Error('Unsupported sign model');
  const labels = Object.keys(signNames);
  if (!Array.isArray(model.classes) || new Set(model.classes).size !== model.classes.length ||
      !labels.every(label => model.classes.includes(label)) ||
      !model.classes.every(label => labels.includes(label) || label === 'unknown')) {
    throw Error('Invalid sign classes');
  }
  if (!Number.isFinite(model.threshold) || model.threshold <= 0 || model.threshold >= 1) {
    throw Error('Invalid sign threshold');
  }
  return validateNetwork(model, STEPS * FRAME_SIZE) as SignModel;
}

export function motionVector(frames: MotionFrame[], sampledCount: number): number[] {
  if (frames.length < 5 || frames.length < .55 * sampledCount) {
    throw Error('Too few frames with a visible hand.');
  }
  const first = frames[0], last = frames[frames.length - 1];
  if (!['Left', 'Right'].includes(first.hand) || frames.some(frame => frame.hand !== first.hand)) {
    throw Error('Hand tracking switched sides during the clip.');
  }
  const duration = last.time - first.time;
  if (duration < .25 || frames.some((frame, i) => {
    const gap = i > 0 ? frame.time - frames[i - 1].time : 1;
    return !Number.isFinite(frame.time) || (i > 0 && (gap <= 0 || gap > .35));
  })) throw Error('Keep one hand visible during the full motion.');

  const scales = frames.map(frame => frame.palm_size).sort((a, b) => a - b);
  if (scales.some(scale => !Number.isFinite(scale) || scale < 1e-6)) throw Error('Hand is too small.');
  const median = (scales[Math.floor((scales.length - 1) / 2)] + scales[Math.floor(scales.length / 2)]) / 2;
  const reflect = first.hand === 'Left' ? -1 : 1;
  const values = frames.map(frame => [
    ...frame.geometry,
    reflect * (frame.wrist[0] - first.wrist[0]) / median,
    (frame.wrist[1] - first.wrist[1]) / median,
  ]);
  if (values.some(row => row.length !== FRAME_SIZE || row.some(v => !Number.isFinite(v)))) {
    throw Error('Invalid motion features.');
  }

  let right = 1;
  return Array.from({ length: STEPS }, (_, step) => {
    const time = first.time + duration * step / (STEPS - 1);
    while (right < frames.length - 1 && frames[right].time < time) right++;
    const fraction = (time - frames[right - 1].time) / (frames[right].time - frames[right - 1].time);
    return values[right - 1].map((from, i) => from + (values[right][i] - from) * fraction);
  }).flat();
}

export function readMotionFrame(result: HandLandmarkerResult, time: number, aspect: number): MotionFrame | undefined {
    if (result.landmarks.length !== 1 || result.worldLandmarks.length !== 1) return;
    const [image] = result.landmarks;
    const [world] = result.worldLandmarks;
    const hand = result.handedness[0]?.[0]?.categoryName ?? '';
    const wrist = image[0], middle = image[9];
    try {
      return {
        time, hand,
        wrist: [wrist.x * aspect, wrist.y],
        palm_size: Math.hypot((middle.x - wrist.x) * aspect, middle.y - wrist.y),
        geometry: features(world, hand).geometry,
      };
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      // Count degenerate landmarks as missing samples.
    }
}

// Segment an isolated action from changes in wrist position and finger geometry.
export class LiveSignSegment {
  private history: MotionFrame[] = [];
  private active: MotionFrame[] = [];
  private lastMotion = 0;
  private movements = 0;

  reset() {
    this.history = [];
    this.active = [];
    this.movements = 0;
  }

  private finish() {
    const frames = this.active;
    const usable = this.movements >= 2 && frames.length >= 5 &&
      this.lastMotion - frames[0].time >= .35;
    this.reset();
    return usable ? frames : undefined;
  }

  update(frame: MotionFrame | undefined, time: number) {
    const previous = this.history.at(-1);
    if (!frame) {
      if (previous && time - previous.time >= .3) return this.finish();
      return;
    }
    if (previous && (previous.hand !== frame.hand || time - previous.time > .35)) this.reset();
    const last = this.history.at(-1);
    if (last && time - last.time < 1 / SAMPLE_HZ - 1e-6) return;
    this.history = this.history.filter(f => time - f.time <= .32);
    const reference = this.history[0];
    this.history.push(frame);
    if (reference) {
      const wristShift = Math.hypot(frame.wrist[0]-reference.wrist[0],frame.wrist[1]-reference.wrist[1]) / frame.palm_size;
      const shapeShift = Math.max(...frame.geometry.map((v,i)=>Math.abs(v-reference.geometry[i])));
      if (wristShift >= .18 || shapeShift >= .18) {
        if (!this.active.length) this.active = this.history.slice(0,-1);
        this.lastMotion = time;
        this.movements++;
      }
    }
    if (!this.active.length) return;
    this.active.push(frame);
    if (time - this.active[0].time > MAX_SECONDS) { this.reset(); return; }
    if (time - this.lastMotion >= .6) return this.finish();
  }
}

export class SignClip {
  private frames: MotionFrame[] = [];
  private sampled = 0;
  private twoHands = false;
  private lastSample = -Infinity;

  add(result: HandLandmarkerResult, time: number, aspect: number) {
    if (result.landmarks.length > 1) this.twoHands = true;
    // The camera loop may run faster than the offline clip sampler.
    if (time - this.lastSample + 1e-6 < 1 / SAMPLE_HZ) return;
    this.lastSample = time;
    this.sampled++;
    if (result.landmarks.length !== 1 || result.worldLandmarks.length !== 1) return;
    const frame = readMotionFrame(result, time, aspect);
    if (frame) this.frames.push(frame);
  }

  classify(model: SignModel) {
    if (this.twoHands) throw Error('Show a single hand throughout the clip.');
    return predict(model, motionVector(this.frames, this.sampled));
  }
}

function waitForVideo(video: HTMLVideoElement, event: string, action: () => void) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, success);
      video.removeEventListener('error', failure);
    };
    const success = () => { cleanup(); resolve(); };
    const failure = () => { cleanup(); reject(Error('Unable to decode or seek this video. Try an MP4.')); };
    const timer = setTimeout(failure, 8000);
    video.addEventListener(event, success, { once: true });
    video.addEventListener('error', failure, { once: true });
    action();
  });
}

export async function readSignVideo(file: File, createTracker: () => Promise<HandLandmarker>) {
  const clip = new SignClip();
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'auto';
  video.muted = true;
  let tracker: HandLandmarker | undefined;
  try {
    await waitForVideo(video, 'loadeddata', () => { video.src = url; });
    if (!Number.isFinite(video.duration) || video.duration > MAX_SECONDS || video.duration < .3) {
      throw Error('Choose a clip between 0.3 and 12 seconds.');
    }
    tracker = await createTracker();
    const aspect = video.videoWidth / video.videoHeight;
    for (let frame = 0; frame / SAMPLE_HZ < video.duration; frame++) {
      const time = frame / SAMPLE_HZ;
      if (frame > 0) await waitForVideo(video, 'seeked', () => { video.currentTime = time; });
      clip.add(tracker.detectForVideo(video, Math.round(time * 1000)), time, aspect);
    }
    return clip;
  } finally {
    tracker?.close();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export const MAX_LIVE_CLIP_MS = MAX_SECONDS * 1000;
