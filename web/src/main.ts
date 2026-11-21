import './style.css';
import {reviewPanel, setupReview} from './review';
import {HandLandmarker,FilesetResolver,DrawingUtils} from '@mediapipe/tasks-vision';
import {features,type Point} from './features';
import {predict,validateModel,StablePrediction,type Model} from './model';
import { demoSequence, MAX_LIVE_CLIP_MS, readSignVideo, SignClip, signNames, validateSignModel, type SignModel } from './signs';
import { InstrumentPlayer, instrumentOptions, noteForDigit, notes, type Note, type Timbre } from './instruments';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
$('app').innerHTML=`
<header><div class="brand">gesture<span style="color:#819b61"> /</span></div><div class="tag">CSIT5410 · Recognition systems</div></header>
<main><nav class="mode-switch" aria-label="Workspace"><button id="recognition-tab" aria-pressed="true">Recognition</button><button id="collection-tab" aria-pressed="false">Data entry</button></nav>
<div class="workspace"><section><div class="camera"><div class="live-label" id="camera-state">CAMERA OFF</div><video id="video" autoplay playsinline muted></video><canvas id="overlay"></canvas><p id="hand-guide" class="hand-guide" role="status" hidden></p><div class="empty" id="empty"><span>✳</span><h2>Your hand goes here.</h2><p>Start the camera to explore your hand landmarks.<br>Camera frames stay in this browser.</p></div></div><div class="toolbar"><button id="start">Start camera</button><button class="secondary" id="stop" disabled>Stop camera</button></div><label class="camera-mode">Camera mode<select id="camera-mode"><option value="digits">Numbers</option><option value="signs" disabled>Sign words (model required)</option><option value="music">Instruments</option></select></label><div id="save-receipt" hidden><p id="project-status" class="small" role="status"></p><button id="case-sync" class="secondary" disabled>Retry project save</button></div><p id="message" role="status" aria-live="polite"></p></section>
<aside class="panel" id="recognition-panel"><div class="tag">Recognition</div><div class="result" id="result">—</div><p class="status" id="status" role="status">Loading default model…</p><div class="metrics"><div><span class="tag">Confidence</span><strong id="confidence">—</strong></div><div><span class="tag">Frame time</span><strong id="latency">—</strong></div></div><div class="divider"></div><div id="speech-controls"><label>Voice language<select id="voice"><option value="yue">廣東話 / Cantonese</option><option value="en">English</option><option value="zh">普通话 / Mandarin</option></select></label><div class="toolbar"><button id="speak" disabled>Speak number</button><button id="preview-voice" class="secondary">Preview voice</button></div><p class="small">Offline voice packs · numbers 0–10</p><label><input type="checkbox" id="auto">Speak each stable prediction</label></div>
<section id="music-controls" class="music-controls" aria-labelledby="music-heading" hidden>
 <h2 id="music-heading">Play the scale</h2>
 <label>Instrument<select id="instrument">${instrumentOptions.map(({id,name})=>`<option value="${id}">${name}</option>`).join('')}</select></label>
 <div class="note-keys" role="group" aria-label="Listen to a note">${notes.map(note=>`<button type="button" class="note-key" data-note="${note.digit}" aria-label="${note.digit}: ${note.name} ${note.pitch}"><strong>${note.digit}</strong><span>${note.name}</span><small>${note.pitch}</small></button>`).join('')}</div>
 <p class="small">Tap a note to preview it. Show a digit to play it with your hand.</p>
 <p id="note-feedback" class="small" aria-live="polite"></p>
</section><details><summary>Digit model settings</summary><p class="small">Active digit model</p><output id="active-model" class="active-model">Loading…</output><button type="button" id="choose-model" class="secondary">Choose another model…</button><input id="model" type="file" accept=".json" hidden><p class="small" id="model-status">Loading default model…</p><button id="default-model" class="secondary">Use latest default model</button></details></aside>
${reviewPanel}</div>
<details id="feature-panel" class="panel fold"><summary>Feature explorer</summary><p class="small">Finger bend · 0 = straight, 1 = folded</p><div class="bars">${['Thumb','Index','Middle','Ring','Pinky'].map((x,i)=>`<div class="bar"><div class="track"><div class="fill" id="bend-${i}"></div></div>${x}</div>`).join('')}</div><p class="small" id="normal">Palm normal: —</p><p class="small">63 coordinates + 20 geometric features · single hand</p></details>
<details id="sign-panel" class="panel fold"><summary>Sign word clips</summary>
 <h2 id="sign-title">Recognize a sign clip</h2>
 <p class="small">One hand and one sign per clip. 多謝 · 下次 · 再見</p>
 <div class="fields sign-fields">
  <label>Sign model (.json)<input id="sign-model" type="file" accept=".json"></label>
  <label>Local video (.mp4, .mov, .webm)<input id="sign-video" type="file" accept="video/*,.mp4,.mov,.webm" disabled></label>
 </div>
 <div class="toolbar"><button id="record-sign" disabled>Start sign</button>
  <button id="reset-signs" class="secondary" disabled>Clear words</button>
  <button id="speak-phrase" class="secondary" disabled>Speak sentence</button>
 </div>
 <p id="sign-status" class="status" role="status">Loading the default sign model…</p>
 <p id="sign-words" lang="yue" aria-live="polite"></p>
</details><footer><span>LOCAL PROCESSING / NO FRAME UPLOADS</span><span>Prototype · Single-hand poses</span></footer></main>`;
const video=$<HTMLVideoElement>('video'),canvas=$<HTMLCanvasElement>('overlay'),ctx=canvas.getContext('2d')!;
const review = setupReview();
let modelName = '';
const drawing=new DrawingUtils(ctx), gate=new StablePrediction();
const musicGate = new StablePrediction(220, 180);
let landmarker:HandLandmarker|undefined,stream:MediaStream|undefined,running=false,starting=false,raf=0,lastVideoTime=-1,lastInference=0;
let model:Model|undefined, latest:{points:Point[];hand:string;time:number}|null=null,accepted:string|null=null;
let lastCapture=-Infinity;let audio:HTMLAudioElement|null=null;
const voice=$<HTMLSelectElement>('voice');
try{const saved=localStorage.getItem('gesture-voice');if(saved && ['yue','en','zh'].includes(saved))voice.value=saved;}catch{}
voice.onchange=()=>{audio?.pause();try{localStorage.setItem('gesture-voice',voice.value);}catch{}};
$('preview-voice').onclick=()=>void speak('1');
const message=(s:string)=>$('message').textContent=s;

const cameraMode = $<HTMLSelectElement>('camera-mode');
const player = new InstrumentPlayer();
const instrument = $<HTMLSelectElement>('instrument');
const noteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.note-key'));
const noteFeedback = $('note-feedback');

function showNote(note: Note) {
 const played = player.play(note, instrument.value as Timbre);
 noteButtons.forEach(button => button.classList.toggle('is-playing', button.dataset.note === note.digit));
 noteFeedback.textContent = played
  ? (note.midi === null ? 'Rest' : `${note.name} · ${note.pitch}`)
  : 'Tap a note to enable audio.';
}

for (const button of noteButtons) {
 button.onclick = async () => {
  const note = noteForDigit(button.dataset.note ?? '');
  if (!note) return;
  if (note.midi !== null) await player.enable();
  if (cameraMode.value === 'music') showNote(note);
 };
}
instrument.onchange = () => {
 player.stop();
 noteButtons.forEach(button => button.classList.remove('is-playing'));
 noteFeedback.textContent = '';
 musicGate.reset();
};

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
let signBusy = false;
let signModelRequest = 0;
let confirmedSigns: string[] = [];

function updateSignControls() {
 const option = cameraMode.querySelector<HTMLOptionElement>('option[value="signs"]')!;
 option.disabled = !signModel; option.textContent = signModel ? 'Sign words' : 'Sign words (model required)';
 signVideo.disabled = !signModel || signBusy || Boolean(signRecording);
 signModelInput.disabled = signBusy || Boolean(signRecording);
 recordSign.disabled = !signModel || !running || signBusy;
 cameraMode.disabled = Boolean(signRecording);
 recordSign.textContent = signRecording ? 'Finish sign' : 'Start sign';
 resetSigns.disabled = confirmedSigns.length === 0;
 speakPhrase.title = phraseAvailable ? '' : 'Generate the offline phrase pack to enable playback.';
 speakPhrase.disabled = !phraseAvailable || confirmedSigns.join(',') !== demoSequence.join(',');
 $('sign-words').textContent = confirmedSigns.map(label => signNames[label]).join(' → ');
}

function showSign(clip: SignClip, currentModel: SignModel) {
 const result = clip.classify(currentModel);
 if (result.label === 'unknown' || result.confidence < currentModel.threshold) {
  signStatus.textContent = 'Uncertain sign. Try the clip again.';
  return;
 }
 if (confirmedSigns.length === demoSequence.length) confirmedSigns = [];
 confirmedSigns.push(result.label);
 signStatus.textContent = `Recognized ${signNames[result.label]} · ${Math.round(result.confidence * 100)}%`;
 updateSignControls();
}

function updateCameraMode() {
 const mode = cameraMode.value;
 gate.reset();
 musicGate.reset();
 clearPrediction();
 player.stop();
 noteButtons.forEach(button => button.classList.remove('is-playing'));
 noteFeedback.textContent = '';
 audio?.pause();
 $('music-controls').hidden = mode !== 'music';
 $('speech-controls').hidden = mode === 'music';
 const help = {
  signs: 'Use Start sign and Finish sign to recognize one action.',
  music: 'Show a number gesture to play its note. Release your hand to repeat it.',
  digits: 'Hold a number gesture to recognize it.',
 };
 $('status').textContent = help[mode as keyof typeof help];
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
 if (dialog.returnValue !== 'apply') {
  person.value = original.person; session.value = original.session; split.value = original.split;
 } else {
  split.dispatchEvent(new Event('change'));
  $('session-summary').textContent = [person.value,session.value,split.selectedOptions[0].text].join(' · ');
 }
 dialog.returnValue = '';
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
 signBusy = true;
 signStatus.textContent = 'Analyzing the video locally…';
 updateSignControls();
 try { showSign(await readSignVideo(file, createTracker), currentModel); }
 catch (error) { signStatus.textContent = error instanceof Error ? error.message : String(error); }
 finally { signBusy = false; updateSignControls(); }
};

resetSigns.onclick = () => { confirmedSigns = []; updateSignControls(); };
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
  signModel = next;
  confirmedSigns = [];
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
  if (!response.ok) throw Error('Sign model unavailable');
  const next = validateSignModel(await response.json());
  if (request !== signModelRequest) return;
  signModel = next;
  signStatus.textContent = 'Sign model ready. Select a local video or start the camera.';
 } catch {
  if (request === signModelRequest) signStatus.textContent = 'Choose a trained sign model to enable video recognition.';
 }
 updateSignControls();
}
void loadDefaultSigns();
void checkPhrase();
voice.addEventListener('change',()=>void checkPhrase());

async function createTracker() {
 const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}vendor/wasm`);
 return HandLandmarker.createFromOptions(files, {
  baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'CPU' },
  runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6,
  minHandPresenceConfidence: .6, minTrackingConfidence: .6,
 });
}
function clearPrediction(){accepted=null;$('result').textContent='—';$('confidence').textContent='—';$<HTMLButtonElement>('speak').disabled=true;}
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
 if (cameraMode.value === 'signs') return signRecording ? 'Hand in view. Complete your sign.' : 'Hand in view. Start a sign clip when ready.';
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

function stop(){running=false;musicGate.reset();player.stop();noteButtons.forEach(button=>button.classList.remove('is-playing'));noteFeedback.textContent='';if(signRecording){signRecording=undefined;signStatus.textContent='Recording cancelled.';}updateSignControls();handGuide.hidden=true;pendingGuide='';cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=undefined;video.srcObject=null;latest=null;lastVideoTime=-1;gate.reset();clearPrediction();clearFeatures();audio?.pause();ctx.clearRect(0,0,canvas.width,canvas.height);$('empty').hidden=false;$('camera-state').textContent='CAMERA OFF';$<HTMLButtonElement>('start').disabled=false;$<HTMLButtonElement>('stop').disabled=true;$<HTMLButtonElement>('capture').disabled=true;$('latency').textContent='—';}
async function speak(label:string){
 player.stop();
 if(!/^([0-9]|10|thanks-see-you)$/.test(label))return;
 audio?.pause();audio=new Audio(`${import.meta.env.BASE_URL}audio/${voice.value}/${label}.wav`);
 try{await audio.play();message('');}catch{message(`Audio unavailable. Check the selected voice pack at public/audio/${voice.value}/${label}.wav.`);}
}
function frame(now:number){
 if(!running)return;
 try{
  if(video.readyState>=2 && video.currentTime!==lastVideoTime && now-lastInference>=66){
   lastVideoTime=video.currentTime;lastInference=now;const begin=performance.now();
   const r=landmarker!.detectForVideo(video,now);
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
    if(cameraMode.value === 'signs'){$('status').textContent=signRecording?'Recording a sign clip…':'Use Start sign to record one action.';}
    else if (model) {
     const prediction = predict(model, f[model.feature_set]);
     const eligible = prediction.confidence >= .8 && prediction.label !== 'unknown' ? prediction.label : null;
     if (cameraMode.value === 'music') {
      const event = musicGate.update(eligible, now);
      const note = event === null ? undefined : noteForDigit(event);
      if (note) showNote(note);
      const stable = eligible !== null && musicGate.isStable(eligible, now);
      $('result').textContent = stable ? eligible : '—';
      $('status').textContent = stable ? 'Change digits, or release your hand to repeat.' : 'Hold a number gesture to play its note.';
     } else {
      const event = gate.update(eligible, now);
      accepted = eligible !== null && gate.isStable(eligible, now) ? eligible : null;
      $('result').textContent = accepted ?? '—';
      $<HTMLButtonElement>('speak').disabled = accepted === null;
      $('status').textContent = accepted ? 'Stable prediction. Ready to speak.'
       : eligible ? `Candidate ${eligible}. Hold steady for 0.6 s to confirm.`
       : prediction.label === 'unknown' ? 'Hand tracked. The classifier predicts an unknown gesture.'
       : `Candidate ${prediction.label} is below the 80% confidence threshold.`;
      if (entering && !dialog.open && event) review.capture(prediction, modelName, hand, latest.points, r.landmarks[0], video);
      if (!entering && event && $<HTMLInputElement>('auto').checked) void speak(event);
     }
     $('confidence').textContent = `${(prediction.confidence * 100).toFixed(1)}%`;
    }else{$('status').textContent='Hand detected. Load a trained model to recognize numbers.';}
   }else{clearFeatures();clearPrediction();gate.update(null,now);musicGate.update(null,now);$('camera-state').textContent='LIVE / WAITING';$('status').textContent=r.landmarks.length>1?'Use one hand only. Two-hand poses are not supported yet.':'No hand detected. Place one hand in view.';}
   $('latency').textContent=`${Math.round(performance.now()-begin)} ms`;
  }
 }catch(e){latest=null;gate.reset();musicGate.update(null,now);clearPrediction();clearFeatures();$<HTMLButtonElement>('capture').disabled=true;message(`Frame skipped: ${e instanceof Error?e.message:String(e)}`);}
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
$('speak').onclick=()=>{if(accepted)void speak(accepted);};
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
 model=next;audio?.pause();player.stop();gate.reset();musicGate.reset();clearPrediction();
 $('model-status').textContent=`${next.feature_set} · Classes: ${next.classes.join(', ')}`;
 $('status').textContent='Model ready. Start the camera and hold a gesture.';
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
  if(!model)$('status').textContent='Choose a trained model to enable recognition.';
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
