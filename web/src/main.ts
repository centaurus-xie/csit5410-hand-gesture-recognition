import './style.css';
import {reviewPanel, setupReview} from './review';
import {HandLandmarker,FilesetResolver,DrawingUtils} from '@mediapipe/tasks-vision';
import {features,type Point} from './features';
import {predict,validateModel,StablePrediction,type Model} from './model';
import { demoSequence, LiveSignSegment, motionVector, readMotionFrame, MAX_LIVE_CLIP_MS, readSignVideo, SignClip, signNames, validateSignModel, type SignModel } from './signs';
import { InstrumentPlayer, chordDigits, chordForDegree, chordOctaves, chordQualities, defaultChordOctave, defaultChordQuality, instrumentOptions, noteForDigit, notes, type Note, type Timbre } from './instruments';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
$('app').innerHTML=`
<header class="site-header">
 <div class="header-inner">
  <div class="brand"><h1>Gesture</h1><span class="course">CSIT5410</span></div>
  <nav class="mode-switch" aria-label="Workspace">
   <button id="recognition-tab" aria-pressed="true">Recognition</button>
   <button id="collection-tab" aria-pressed="false">Data entry</button>
  </nav>
 </div>
</header>
<main>
<div class="workspace">
 <section class="capture-panel" aria-label="Camera">
  <div class="camera">
   <div class="live-label" id="camera-state">CAMERA OFF</div>
   <video id="video" autoplay playsinline muted></video>
   <canvas id="overlay"></canvas>
   <p id="hand-guide" class="hand-guide" role="status" hidden></p>
   <div class="empty" id="empty">
    <span class="viewfinder" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <h2>Camera is off</h2>
    <p>Start the camera and hold one hand in view.</p>
   </div>
  </div>
  <div class="camera-controls">
   <div class="toolbar"><button id="start">Start camera</button><button class="secondary" id="stop" disabled>Stop camera</button></div>
   <label class="camera-mode" for="camera-mode">Mode<select id="camera-mode"><option value="digits">Numbers</option><option value="signs" disabled>Sign words (model required)</option><option value="music">Instruments</option></select></label>
  </div>
<div id="save-receipt" hidden><p id="project-status" class="small" role="status"></p><button id="case-sync" class="secondary" disabled>Retry project save</button></div><p id="message" role="status" aria-live="polite"></p></section>
<aside class="panel" id="recognition-panel" aria-labelledby="prediction-heading"><h2 id="prediction-heading" class="tag">Recognition result</h2><div class="result" id="result">—</div><p class="status" id="status" role="status">Loading default model…</p><div class="metrics"><div><span class="tag">Confidence</span><strong id="confidence">—</strong></div><div><span class="tag">Frame time</span><strong id="latency">—</strong></div></div><div class="divider"></div><div id="speech-controls"><label>Voice language<select id="voice"><option value="yue">廣東話 / Cantonese</option><option value="en">English</option><option value="zh">普通话 / Mandarin</option></select></label><div class="toolbar"><button id="speak" disabled>Speak number</button><button id="preview-voice" class="secondary">Preview voice</button></div><p class="small" id="voice-pack-label">Offline voice packs · numbers 0–10</p><label><input type="checkbox" id="auto"><span id="auto-speech-label">Speak each stable prediction</span></label></div>
<section id="music-controls" class="music-controls" aria-labelledby="music-heading" hidden>
 <h2 id="music-heading">Play the scale</h2>
 <label>Instrument<select id="instrument">${instrumentOptions.map(({id,name})=>`<option value="${id}">${name}</option>`).join('')}</select></label>
 <div class="note-keys" id="scale-keys" role="group" aria-label="Listen to a note">${notes.map(note=>`<button type="button" class="note-key" data-note="${note.digit}" aria-label="${note.digit}: ${note.name} ${note.pitch}"><strong>${note.digit}</strong><span>${note.name}</span><small>${note.pitch}</small></button>`).join('')}</div>
 <div class="note-keys" id="chord-keys" role="group" aria-label="Play a chord" hidden>${chordDigits.map(digit=>{const chord=chordForDegree(digit);const chosen=defaultChordQuality(digit);return `<div class="chord-cell"><button type="button" class="note-key" data-degree="${digit}"><strong>${digit}</strong><span></span><small></small></button><select data-degree="${digit}" data-control="quality" aria-label="Degree ${digit} type">${chordQualities.map(quality=>`<option value="${quality.id}"${quality.id===chosen?' selected':''}>${quality.label}</option>`).join('')}</select><select data-degree="${digit}" data-control="octave" aria-label="Degree ${digit} octave">${chordOctaves.map(octave=>`<option value="${octave}"${octave===defaultChordOctave?' selected':''}>${chord?.letter ?? ''}${octave}</option>`).join('')}</select></div>`;}).join('')}</div>
 <p class="small" id="music-help">Tap a key to preview it. Show 1–9 to play or 0 to rest.</p>
 <p id="note-feedback" class="small" aria-live="polite"></p>
</section><details id="digit-model-settings"><summary>Digit model settings</summary><p class="small">Active digit model</p><output id="active-model" class="active-model">Loading…</output><button type="button" id="choose-model" class="secondary">Choose another model…</button><input id="model" type="file" accept=".json" hidden><p class="small" id="model-status">Loading default model…</p><button id="default-model" class="secondary">Use latest default model</button></details></aside>
${reviewPanel}</div>
<details id="feature-panel" class="panel fold"><summary>Feature explorer</summary><p class="small">Finger bend · 0 = straight, 1 = folded</p><div class="bars">${['Thumb','Index','Middle','Ring','Pinky'].map((x,i)=>`<div class="bar"><div class="track"><div class="fill" id="bend-${i}"></div></div>${x}</div>`).join('')}</div><p class="small" id="normal">Palm normal: —</p><p class="small">63 coordinates + 20 geometric features · single hand</p></details>
<details id="sign-panel" class="panel fold"><summary>Sign words</summary>
 <h2 id="sign-title">Live sign recognition</h2>
 <p class="small">多謝 · 下次 · 再見. Make one sign, then pause briefly.</p>
 <button id="live-signs">Use webcam for signs</button>
 <p id="sign-status" class="status" role="status">Loading the default sign model…</p>
 <button id="retry-signs" class="secondary" hidden>Retry default model</button>
 <details><summary>Clip and model options</summary>
 <div class="fields sign-fields">
  <label>Sign model (.json)<input id="sign-model" type="file" accept=".json"></label>
  <label>Local video (.mp4, .mov, .webm)<input id="sign-video" type="file" accept="video/*,.mp4,.mov,.webm" disabled></label>
 </div>
 <div class="toolbar"><button id="record-sign" disabled>Start sign</button></div></details><div class="toolbar">
  <button id="reset-signs" class="secondary" disabled>Clear words</button>
  <button id="speak-phrase" class="secondary" disabled>Speak sentence</button>
 </div>
 <p id="sign-words" lang="yue" aria-live="polite"></p>
</details><footer>Camera frames are processed on this device.</footer></main>`;
const video=$<HTMLVideoElement>('video'),canvas=$<HTMLCanvasElement>('overlay'),ctx=canvas.getContext('2d')!;
const review = setupReview();
let modelName = '';
const drawing=new DrawingUtils(ctx), gate=new StablePrediction();
const musicGate = new StablePrediction(120, 180);
let landmarker:HandLandmarker|undefined,stream:MediaStream|undefined,running=false,starting=false,raf=0,lastVideoTime=-1,lastInference=0;
let model:Model|undefined, latest:{points:Point[];hand:string;time:number}|null=null,accepted:string|null=null;
let acceptedSign: string | null = null;
let lastCapture=-Infinity;let audio:HTMLAudioElement|null=null;
const voice=$<HTMLSelectElement>('voice');
const speakResult = $<HTMLButtonElement>('speak');
const autoSpeech = $<HTMLInputElement>('auto');
try{const saved=localStorage.getItem('gesture-voice');if(saved && ['yue','en','zh'].includes(saved))voice.value=saved;}catch{}
voice.onchange=()=>{stopSpeech();try{localStorage.setItem('gesture-voice',voice.value);}catch{}};
const message=(s:string)=>$('message').textContent=s;

const cameraMode = $<HTMLSelectElement>('camera-mode');
const player = new InstrumentPlayer();
const instrument = $<HTMLSelectElement>('instrument');
const noteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#scale-keys .note-key'));
const chordButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#chord-keys .note-key'));
const noteFeedback = $('note-feedback');
const chordsOn = () => instrument.value === 'accompaniment';

function chordControl(digit: string, control: 'octave' | 'quality') {
 return document.querySelector<HTMLSelectElement>(`#chord-keys select[data-degree="${digit}"][data-control="${control}"]`);
}
function octaveFor(digit: string) {
 const octave = Number(chordControl(digit, 'octave')?.value);
 return Number.isFinite(octave) ? octave : defaultChordOctave;
}
function qualityFor(digit: string) {
 return chordControl(digit, 'quality')?.value || defaultChordQuality(digit);
}
function refreshChords() {
 for (const button of chordButtons) {
  const digit = button.dataset.degree ?? '';
  const chord = chordForDegree(digit, octaveFor(digit), qualityFor(digit));
  const name = button.querySelector('span');
  const roman = button.querySelector('small');
  if (name) name.textContent = chord?.name ?? '';
  if (roman) roman.textContent = ['', 'I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'][Number(digit)] ?? '';
  button.setAttribute('aria-label', `${digit}: ${chord?.name ?? ''}`);
 }
}
function showNote(note: Note) {
 const played = player.play(note, instrument.value as Timbre);
 noteButtons.forEach(button => button.classList.toggle('is-playing', button.dataset.note === note.digit));
 noteFeedback.textContent = played
  ? (note.midi === null ? 'Rest' : `${note.name} · ${note.pitch}`)
  : 'Tap a note to enable audio.';
}
async function showChord(digit: string) {
 const chord = chordForDegree(digit, octaveFor(digit), qualityFor(digit));
 if (!chord) return;
 if (!(await player.enable())) { noteFeedback.textContent = 'Tap a chord to enable audio.'; return; }
 const played = player.playChord(chord);
 chordButtons.forEach(button => button.classList.toggle('is-playing', button.dataset.degree === digit));
 noteFeedback.textContent = played ? `${digit} · ${chord.name}` : 'Tap a chord to enable audio.';
}
function syncInstrument() {
 const chords = chordsOn();
 $('scale-keys').hidden = chords;
 $('chord-keys').hidden = !chords;
 $('music-heading').textContent = chords ? 'Chords' : 'Play the scale';
 $('music-help').textContent = chords
  ? 'Verse is 1-6-4-3-2-5, twice. Choose a type and an octave for each chord.'
  : 'Tap a key to preview it. Show 1–9 to play or 0 to rest.';
 refreshChords();
}

for (const button of noteButtons) {
 button.onclick = async () => {
  const note = noteForDigit(button.dataset.note ?? '');
  if (!note) return;
  if (note.midi !== null) await player.enable();
  if (cameraMode.value === 'music' && !chordsOn()) showNote(note);
 };
}
for (const button of chordButtons) {
 button.onclick = () => { if (cameraMode.value === 'music' && chordsOn()) void showChord(button.dataset.degree ?? ''); };
}
instrument.onchange = () => {
 player.stop();
 noteButtons.forEach(button => button.classList.remove('is-playing'));
 chordButtons.forEach(button => button.classList.remove('is-playing'));
 noteFeedback.textContent = '';
 musicGate.reset();
 syncInstrument();
};
for (const select of Array.from(document.querySelectorAll<HTMLSelectElement>('#chord-keys select'))) {
 select.onchange = () => { refreshChords(); };
}
refreshChords();

const signStatus = $('sign-status');
const signVideo = $<HTMLInputElement>('sign-video');
const signModelInput = $<HTMLInputElement>('sign-model');
const recordSign = $<HTMLButtonElement>('record-sign');
const resetSigns = $<HTMLButtonElement>('reset-signs');
let phraseAvailable = false;
async function checkPhrase() {
 const language = voice.value;
 phraseAvailable = false; updateSignControls();
 try {
  const res = await fetch(`${import.meta.env.BASE_URL}audio/${language}/thanks-see-you.wav`, {method:'HEAD'});
  if (language === voice.value) phraseAvailable = res.ok && (res.headers.get('content-type') ?? '').includes('audio');
 } catch {}
 updateSignControls();
}
const speakPhrase = $<HTMLButtonElement>('speak-phrase');
let signModel: SignModel | undefined;
let signRecording: { clip: SignClip; start: number } | undefined;
const liveSign = new LiveSignSegment();
let signBusy = false;
let signModelRequest = 0;
let confirmedSigns: string[] = [];

function updateSignControls() {
 const option = cameraMode.querySelector<HTMLOptionElement>('option[value="signs"]')!;
 option.disabled = !signModel; option.textContent = signModel ? 'Sign words' : 'Sign words (model required)';
 signVideo.disabled = !signModel || signBusy || Boolean(signRecording);
 signModelInput.disabled = signBusy || Boolean(signRecording);
 $<HTMLButtonElement>('live-signs').disabled = !signModel || signBusy || Boolean(signRecording);
 $('live-signs').hidden = running && cameraMode.value === 'signs';
 recordSign.disabled = !signModel || !running || signBusy;
 cameraMode.disabled = Boolean(signRecording);
 recordSign.textContent = signRecording ? 'Finish sign' : 'Start sign';
 resetSigns.disabled = confirmedSigns.length === 0;
 speakPhrase.title = phraseAvailable ? '' : 'Generate the offline phrase pack to enable playback.';
 speakPhrase.disabled = !phraseAvailable || confirmedSigns.join(',') !== demoSequence.join(',');
 $('sign-words').textContent = confirmedSigns.map(label => signNames[label]).join(' → ');
}

function showSign(clip: SignClip, currentModel: SignModel) {
 displaySign(clip.classify(currentModel), currentModel);
}

function displaySign(result: {label:string;confidence:number}, currentModel:SignModel) {
 const acceptedLabel = result.confidence >= currentModel.threshold && Object.hasOwn(signNames, result.label)
  ? result.label : null;
 const confidence = `${Math.round(result.confidence * 100)}%`;
 const inSignMode = cameraMode.value === 'signs';
 if (inSignMode) {
  acceptedSign = acceptedLabel;
  $('result').textContent = acceptedSign === null ? '—' : signNames[acceptedSign];
  $('confidence').textContent = confidence;
  speakResult.disabled = acceptedSign === null;
 }
 if (acceptedLabel === null) {
  signStatus.textContent = 'Uncertain sign. Try the clip again.';
  return;
 }
 if (confirmedSigns.length === demoSequence.length) confirmedSigns = [];
 confirmedSigns.push(acceptedLabel);
 signStatus.textContent = `Recognized ${signNames[acceptedLabel]} · ${confidence}`;
 if (inSignMode && autoSpeech.checked) void speak(acceptedLabel);
 updateSignControls();
}

function updateCameraMode() {
 const mode = cameraMode.value;
 liveSign.reset();
 gate.reset();
 musicGate.reset();
 clearPrediction();
 player.stop();
 noteButtons.forEach(button => button.classList.remove('is-playing'));
 chordButtons.forEach(button => button.classList.remove('is-playing'));
 noteFeedback.textContent = '';
 stopSpeech();
 $('music-controls').hidden = mode !== 'music';
 $('speech-controls').hidden = mode === 'music';
 const signing = mode === 'signs';
 $('digit-model-settings').hidden = signing;
 speakResult.textContent = signing ? 'Speak word' : 'Speak number';
 $('voice-pack-label').textContent = signing ? 'Offline voice packs · 多謝 · 下次 · 再見' : 'Offline voice packs · numbers 0–10';
 $('auto-speech-label').textContent = signing ? 'Speak each recognized word' : 'Speak each stable prediction';
 const help = {
  signs: 'Make one sign, then pause briefly.',
  music: 'Show a number gesture to play its note. Chords uses gestures 1–7.',
  digits: 'Hold a number gesture to recognize it.',
 };
 $('status').textContent = help[mode as keyof typeof help];
 updateSignControls();
}
cameraMode.onchange = () => {
 updateCameraMode();
 if (cameraMode.value === 'music') void player.enable();
};

let entering = false;
let previousMode = 'digits';
const dialog = $<HTMLDialogElement>('session-dialog');
const person = $<HTMLInputElement>('person'), session = $<HTMLInputElement>('session');
const split = $<HTMLSelectElement>('case-split');
let original = {person:'', session:'', split:'train'};
function openSettings() {
 original = {person:person.value, session:session.value, split:split.value};
 dialog.showModal();
}
$('session-settings').onclick = openSettings;
dialog.onclose = () => {
 const applied = dialog.returnValue === 'apply';
 dialog.returnValue = '';
 if (applied) {
  split.dispatchEvent(new Event('change'));
  $('session-summary').textContent = [person.value,session.value,split.selectedOptions[0].text].join(' · ');
  return;
 }
 person.value = original.person;
 session.value = original.session;
 split.value = original.split;
 workspace(false);
 $('recognition-tab').focus();
};
function workspace(entry:boolean) {
 if (entering === entry) return;
 entering = entry;
 if (entry) {
  previousMode = cameraMode.value;
  if (signRecording) { signRecording=undefined; signStatus.textContent='Recording cancelled.'; updateSignControls(); }
 }
 cameraMode.value = entry ? 'digits' : previousMode;
 updateCameraMode();
 $('recognition-panel').hidden = entry;
 $('entry-panel').hidden = !entry;
 $('save-receipt').hidden = !entry;
 $('feature-panel').hidden = $('sign-panel').hidden = entry;
 cameraMode.parentElement!.hidden = entry;
 $('collection-tab').setAttribute('aria-pressed',String(entry));
 $('recognition-tab').setAttribute('aria-pressed',String(!entry));
 $<HTMLInputElement>('case-auto').checked = false;
 if(entry && (!person.value.trim() || !session.value.trim())) openSettings();
}
$('recognition-tab').onclick = () => workspace(false);
$('collection-tab').onclick = () => workspace(true);

$('live-signs').onclick = () => {
 cameraMode.value = 'signs';
 updateCameraMode();
 if (!running) $('start').click();
 video.scrollIntoView({block:'center'});
};
recordSign.onclick = () => {
 if (!signModel || !running) return;
 if (!signRecording) {
  cameraMode.value = 'signs';
  updateCameraMode();
  signRecording = { clip: new SignClip(), start: performance.now() };
  signStatus.textContent = 'Recording. Complete one sign, then press Finish sign.';
 } else {
  const { clip } = signRecording;
  signRecording = undefined;
  try { showSign(clip, signModel); }
  catch (error) { signStatus.textContent = error instanceof Error ? error.message : String(error); }
 }
 updateSignControls();
};

signVideo.onchange = async () => {
 const file = signVideo.files?.[0];
 if (!file || !signModel || signBusy || signRecording) return;
 const currentModel = signModel;
 signVideo.value = '';
 cameraMode.value = 'signs';
 updateCameraMode();
 signBusy = true;
 signStatus.textContent = 'Analyzing the video locally…';
 updateSignControls();
 try { showSign(await readSignVideo(file, createTracker), currentModel); }
 catch (error) { signStatus.textContent = error instanceof Error ? error.message : String(error); }
 finally { signBusy = false; updateSignControls(); }
};

resetSigns.onclick = () => {
 liveSign.reset();
 if (cameraMode.value === 'signs') { clearPrediction(); stopSpeech(); }
 confirmedSigns = [];
 updateSignControls();
};
speakPhrase.onclick = () => void speak('thanks-see-you');

signModelInput.onchange = async () => {
 const file = signModelInput.files?.[0];
 if (!file) return;
 const request = ++signModelRequest;
 signModelInput.value = '';
 try {
  if (file.size > 10_000_000) throw Error('Model exceeds 10 MB.');
  const next = validateSignModel(JSON.parse(await file.text()));
  if (request !== signModelRequest) return;
  liveSign.reset();
  signModel = next;
  confirmedSigns = [];
  if (cameraMode.value === 'signs') { clearPrediction(); stopSpeech(); }
  signStatus.textContent = `Sign model ready · ${file.name}`;
 } catch (error) {
  if (request === signModelRequest) signStatus.textContent = error instanceof Error ? error.message : String(error);
 }
 updateSignControls();
};

async function loadDefaultSigns() {
 const request = ++signModelRequest;
 try {
  const response = await fetch(`${import.meta.env.BASE_URL}models/signs.json`, { cache: 'no-store' });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('json')) throw Error('Expected models/signs.json.');
  const next = validateSignModel(await response.json());
  if (request !== signModelRequest) return;
  liveSign.reset();
  signModel = next;
  $('retry-signs').hidden = true;
  signStatus.textContent = 'Default sign model ready for automatic recognition.';
 } catch (error) {
  if (request === signModelRequest) {
   $('retry-signs').hidden = false;
   signStatus.textContent = `Default sign model could not load. ${error instanceof Error ? error.message : error}`;
  }
 }
 updateSignControls();
}
$('retry-signs').onclick = () => void loadDefaultSigns();
void loadDefaultSigns();
void checkPhrase();
voice.addEventListener('change',()=>void checkPhrase());

async function createTracker() {
 const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}vendor/wasm`);
 return HandLandmarker.createFromOptions(files, {
  baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'CPU' },
  runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6,
  minHandPresenceConfidence: .6, minTrackingConfidence: .5,
 });
}
function clearPrediction(){
 accepted = acceptedSign = null;
 $('result').textContent = '—';
 $('confidence').textContent = '—';
 speakResult.disabled = true;
}
function clearFeatures(){for(let i=0;i<5;i++)$('bend-'+i).style.height='0%';$('normal').textContent='Palm normal: —';}
const handGuide = $('hand-guide');
const initialGuide = 'Show one hand with all fingertips and your wrist in view.';
let pendingGuide = '';
let guideSince = 0;

function placementHint(hands: Point[][]): string {
 if (hands.length > 1) return 'Show only one hand.';
 if (hands.length === 0) return initialGuide;

 const x = hands[0].map(point => point.x);
 const y = hands[0].map(point => point.y);
 const left = Math.min(...x), right = Math.max(...x);
 const top = Math.min(...y), bottom = Math.max(...y);
 const size = Math.max(right - left, bottom - top);

 if (size > .83) return 'Move your hand a little farther from the camera.';
 if (left < .06 || right > .94 || top < .06 || bottom > .94) {
  return 'Move toward the center so your whole hand is visible.';
 }
 if (size < .18) return 'Move your hand a little closer to the camera.';
 if (cameraMode.value === 'signs') return signRecording ? 'Hand in view. Complete your sign.' : 'Make one sign, then pause or lower your hand.';
 return 'Hand in view. Hold your gesture steady.';
}

function updateHandGuide(hands: Point[][], now: number) {
 const hint = placementHint(hands);
 if (hint !== pendingGuide) {
  pendingGuide = hint;
  guideSince = now;
 }
 if (now - guideSince >= 300 && handGuide.textContent !== hint) handGuide.textContent = hint;
}

function stop(){liveSign.reset();running=false;musicGate.reset();player.stop();noteButtons.forEach(button=>button.classList.remove('is-playing'));chordButtons.forEach(button=>button.classList.remove('is-playing'));noteFeedback.textContent='';if(signRecording){signRecording=undefined;signStatus.textContent='Recording cancelled.';}updateSignControls();handGuide.hidden=true;pendingGuide='';cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=undefined;video.srcObject=null;latest=null;lastVideoTime=-1;gate.reset();clearPrediction();clearFeatures();stopSpeech();ctx.clearRect(0,0,canvas.width,canvas.height);$('empty').hidden=false;$('camera-state').textContent='CAMERA OFF';$<HTMLButtonElement>('start').disabled=false;$<HTMLButtonElement>('stop').disabled=true;$<HTMLButtonElement>('capture').disabled=true;$('latency').textContent='—';}
function stopSpeech() {
 const previous = audio;
 audio = null;
 previous?.pause();
}
async function speak(label: string) {
 if (!/^([0-9]|10|thanks-see-you)$/.test(label) && !Object.hasOwn(signNames, label)) return;
 player.stop();
 stopSpeech();
 const path = `audio/${voice.value}/${label}.wav`;
 const playback = audio = new Audio(`${import.meta.env.BASE_URL}${path}`);
 try {
  await playback.play();
  if (audio === playback) message('');
 } catch (error) {
  if (audio !== playback) return;
  message(error instanceof DOMException && error.name === 'NotAllowedError'
   ? 'Tap Preview voice or the speak button to enable audio.'
   : `Audio unavailable. Check the selected voice pack at public/${path}.`);
 }
}
function frame(now:number){
 if(!running)return;
 try{
  if(video.readyState>=2 && video.currentTime!==lastVideoTime && now-lastInference>=66){
   lastVideoTime=video.currentTime;lastInference=now;const begin=performance.now();
   const r=landmarker!.detectForVideo(video,now);
   if (cameraMode.value === 'signs' && signModel && !signRecording && !signBusy) {
    if (r.landmarks.length > 1) liveSign.reset();
    else {
     const time = now / 1000;
     const finished = liveSign.update(readMotionFrame(r,time,video.videoWidth/video.videoHeight),time);
     if (finished) displaySign(predict(signModel,motionVector(finished,finished.length)),signModel);
    }
   }
   if (signRecording) {
    if (now - signRecording.start > MAX_LIVE_CLIP_MS) {
     signRecording = undefined;
     signStatus.textContent = 'Recording exceeded 12 seconds. Try a shorter clip.';
     updateSignControls();
    } else {
     signRecording.clip.add(r, (now - signRecording.start) / 1000, video.videoWidth / video.videoHeight);
    }
   }
   updateHandGuide(r.landmarks,now);
   canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.clearRect(0,0,canvas.width,canvas.height);
   latest=null;$<HTMLButtonElement>('capture').disabled=true;
   if(r.landmarks.length===1 && r.worldLandmarks.length===1){
    drawing.drawConnectors(r.landmarks[0],HandLandmarker.HAND_CONNECTIONS,{color:'#c6e89f',lineWidth:3});drawing.drawLandmarks(r.landmarks[0],{color:'#f6e5b7',radius:3});
    const hand=r.handedness[0][0].categoryName,points=r.worldLandmarks[0],f=features(points,hand);
    latest={points:points.map(({x,y,z})=>({x,y,z})),hand,time:now};$<HTMLButtonElement>('capture').disabled=false;
    for(let i=0;i<5;i++)$('bend-'+i).style.height=`${100*(1-(f.bends[i*2]+f.bends[i*2+1])/2)}%`;
    $('normal').textContent=`Palm normal: ${[f.normal.x,f.normal.y,f.normal.z].map(v=>v.toFixed(2)).join(' / ')}`;
    $('camera-state').textContent=`LIVE / ${hand.toUpperCase()} HAND`;
    if(cameraMode.value === 'signs'){$('status').textContent=signRecording?'Recording a sign clip…':'Automatic sign recognition. Make one sign, then pause.';}
    else if (model) {
     const prediction = predict(model, f[model.feature_set]);
     const eligible = prediction.confidence >= .8 && prediction.label !== 'unknown' ? prediction.label : null;
     if (cameraMode.value === 'music') {
      const chordMode = chordsOn();
      const note = !chordMode && eligible !== null ? noteForDigit(eligible) : undefined;
      const digit = chordMode ? (eligible !== null && /^[1-7]$/.test(eligible) ? eligible : null) : (note?.digit ?? null);
      const event = musicGate.update(digit, now);
      if (event !== null) { if (chordMode) void showChord(event); else if (note) showNote(note); }
      const stable = digit !== null && musicGate.isStable(digit, now);
      $('result').textContent = stable ? digit : '—';
      $('status').textContent = chordMode
       ? (stable ? `Chord ${digit}. Release your hand to play it again.` : 'Hold 1–7. The verse is 1-6-4-3-2-5, twice.')
       : (stable ? 'Change digits, or release your hand to repeat.' : 'Hold a number gesture to play its note.');
     } else {
      const event = gate.update(eligible, now);
      accepted = eligible !== null && gate.isStable(eligible, now) ? eligible : null;
      $('result').textContent = accepted ?? '—';
      speakResult.disabled = accepted === null;
      $('status').textContent = accepted ? 'Stable prediction. Ready to speak.'
       : eligible ? `Candidate ${eligible}. Hold steady for 0.6 s to confirm.`
       : prediction.label === 'unknown' ? 'Hand tracked. The classifier predicts an unknown gesture.'
       : `Candidate ${prediction.label} is below the 80% confidence threshold.`;
      if (entering && !dialog.open && event) review.capture(prediction, modelName, hand, latest.points, r.landmarks[0], video);
      if (!entering && event && autoSpeech.checked) void speak(event);
     }
     $('confidence').textContent = `${(prediction.confidence * 100).toFixed(1)}%`;
    }else{$('status').textContent='Hand detected. Load a trained model to recognize numbers.';}
   }else{clearFeatures();if(cameraMode.value !== 'signs')clearPrediction();gate.update(null,now);musicGate.update(null,now);$('camera-state').textContent='LIVE / WAITING';$('status').textContent=r.landmarks.length>1?'Use one hand only. Two-hand poses are not supported yet.':'No hand detected. Place one hand in view.';}
   $('latency').textContent=`${Math.round(performance.now()-begin)} ms`;
  }
 }catch(e){liveSign.reset();latest=null;gate.reset();musicGate.update(null,now);clearPrediction();clearFeatures();$<HTMLButtonElement>('capture').disabled=true;message(`Frame skipped: ${e instanceof Error?e.message:String(e)}`);}
 raf=requestAnimationFrame(frame);
}
$('start').onclick=async()=>{
 if(starting||running)return;if(cameraMode.value === 'music')void player.enable();starting=true;$<HTMLButtonElement>('start').disabled=true;message('Loading hand tracker…');
 try{
  if(!landmarker) landmarker=await createTracker();
  stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720}},audio:false});video.srcObject=stream;await video.play();
  running=true;updateSignControls();handGuide.textContent=initialGuide;handGuide.hidden=false;$('empty').hidden=true;$<HTMLButtonElement>('stop').disabled=false;message('');raf=requestAnimationFrame(frame);
 }catch(e){stop();message(`Could not start: ${e instanceof Error?e.message:String(e)}. Check camera permission and run npm run assets.`);}finally{starting=false;}
};
$('stop').onclick=()=>{stop();$('status').textContent='Camera stopped.';};
$('preview-voice').onclick = () => void speak(cameraMode.value === 'signs' ? 'thank_you' : '1');
speakResult.onclick = () => {
 const label = cameraMode.value === 'signs' ? acceptedSign : accepted;
 if (label !== null) void speak(label);
};
$('capture').onclick=()=>{
 const person=$<HTMLInputElement>('person').value.trim(),session=$<HTMLInputElement>('session').value.trim();
 if(!person||!session){message('Enter a participant and session before saving.');return;}
 const now=performance.now();if(!latest||now-latest.time>300){message('Wait for a fresh, visible hand.');return;}
 if(now-lastCapture<1000){message('Re-form your gesture before saving another sample.');return;}
 if(review.manual(latest.points,latest.hand,$<HTMLSelectElement>('label').value)) {
  lastCapture=now;message('');
 }
};
let modelRequest=0;
function installModel(next:Model,name:string){
 modelName=name;
 $('active-model').textContent=name;
 model=next;gate.reset();musicGate.reset();
 $('model-status').textContent=`${next.feature_set} · Classes: ${next.classes.join(', ')}`;
 if (cameraMode.value !== 'signs') {
  stopSpeech();player.stop();clearPrediction();
  $('status').textContent='Model ready. Start the camera and hold a gesture.';
 }
}
async function loadDefault(){
 const request=++modelRequest;
 $('model-status').textContent='Loading default model…';
 try{
  const response=await fetch(`${import.meta.env.BASE_URL}models/default.json`,{cache:'no-store'});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const version=Array.from(digest.slice(0,4),v=>v.toString(16).padStart(2,'0')).join('');
  const next=validateModel(JSON.parse(new TextDecoder().decode(bytes)));
  if(request!==modelRequest)return;
  installModel(next,next.release_name || `default.json · ${version}`);message('');
 }catch(err){if(request!==modelRequest)return;
  $('model-status').textContent=model?'Default unavailable; previous model retained.':'Default unavailable. Choose a model file below or publish a default.';
  if(!model)$('active-model').textContent='No active model';
  if(!model && cameraMode.value !== 'signs')$('status').textContent='Choose a trained model to enable recognition.';
 }
}
$('choose-model').onclick=()=>$<HTMLInputElement>('model').click();
$('default-model').onclick=()=>void loadDefault();
$<HTMLInputElement>('model').onchange=async e=>{
 const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
 const request=++modelRequest;
 try{
  if(file.size>10_000_000)throw Error('Model exceeds 10 MB');
  const next=validateModel(JSON.parse(await file.text()));
  if(request!==modelRequest)return;
  installModel(next,next.release_name || `${file.name} · file modified ${new Date(file.lastModified).toISOString()}`);message('');
 }catch(err){if(request===modelRequest)message(`Model not loaded; previous model retained if available: ${err instanceof Error?err.message:String(err)}`);}
 (e.target as HTMLInputElement).value='';
};
void loadDefault();
window.addEventListener('pagehide',()=>{stop();landmarker?.close();});
