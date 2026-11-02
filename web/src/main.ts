import './style.css';
import {HandLandmarker,FilesetResolver,DrawingUtils} from '@mediapipe/tasks-vision';
import {features,FEATURE_VERSION,type Point} from './features';
import {predict,validateModel,StablePrediction,type Model} from './model';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
$('app').innerHTML=`
<header><div class="brand">gesture<span style="color:#819b61"> /</span></div><div class="tag">CSIT5410 · Recognition systems</div></header>
<main><section class="intro"><div><div class="tag">01 / Static number studio</div><h1>A gesture. A voice.</h1></div><p>Explore the shape of a number.<br>One hand, a clear view, and a moment to hold.</p></section>
<div class="workspace"><section><div class="camera"><div class="live-label" id="camera-state">CAMERA OFF</div><video id="video" autoplay playsinline muted></video><canvas id="overlay"></canvas><div class="empty" id="empty"><span>✳</span><h2>Your hand goes here.</h2><p>Start the camera to explore your hand landmarks.<br>Camera frames stay in this browser.</p></div></div><div class="toolbar"><button id="start">Start camera</button><button class="secondary" id="stop" disabled>Stop camera</button></div><p id="message" role="status" aria-live="polite"></p></section>
<aside class="panel"><div class="tag">Recognition</div><div class="result" id="result">—</div><p class="status" id="status" role="status">Model not loaded. Explore landmarks or collect samples first.</p><div class="metrics"><div><span class="tag">Confidence</span><strong id="confidence">—</strong></div><div><span class="tag">Frame time</span><strong id="latency">—</strong></div></div><div class="divider"></div><button id="speak" disabled>Play Cantonese</button><p class="small">Add your recordings to enable playback. No audio is bundled yet.</p><label><input type="checkbox" id="auto">Speak each stable prediction</label><div class="divider"></div><label class="model-label">Load trained classifier (.json)<input id="model" type="file" accept=".json"></label><p class="small" id="model-status">No trained classifier loaded</p></aside></div>
<div class="bottom"><section class="panel"><div class="tag">Feature explorer</div><h2>Read the shape.</h2><p class="small">Finger bend · 0 = straight, 1 = folded</p><div class="bars">${['Thumb','Index','Middle','Ring','Pinky'].map((x,i)=>`<div class="bar"><div class="track"><div class="fill" id="bend-${i}"></div></div>${x}</div>`).join('')}</div><p class="small" id="normal">Palm normal: —</p><p class="small">63 coordinates + 20 geometric features · single hand</p></section><section class="panel"><div class="tag">Sample collection</div><h2>Build a shared vocabulary.</h2><div class="fields"><label>Participant<input id="person" placeholder="p01" maxlength="40"></label><label>Session<input id="session" placeholder="s01" maxlength="40"></label><label>Label<select id="label">${Array.from({length:10},(_,i)=>`<option>${i+1}</option>`).join('')}<option>unknown</option></select></label></div><div class="toolbar"><button id="capture" disabled>Save sample</button><button class="secondary" id="export" disabled>Export JSONL (0)</button></div><p class="notice">One click = one sample. Lower your hand and form the gesture again between captures. Export before leaving.</p></section></div><footer><span>LOCAL PROCESSING / NO FRAME UPLOADS</span><span>Prototype · Single-hand poses</span></footer></main>`;
const video=$<HTMLVideoElement>('video'),canvas=$<HTMLCanvasElement>('overlay'),ctx=canvas.getContext('2d')!;
const drawing=new DrawingUtils(ctx), gate=new StablePrediction();
let landmarker:HandLandmarker|undefined,stream:MediaStream|undefined,running=false,starting=false,raf=0,lastVideoTime=-1,lastInference=0;
let model:Model|undefined, latest:{points:Point[];hand:string;time:number}|null=null,accepted:string|null=null;
const samples:object[]=[];let lastCapture=-Infinity;let audio:HTMLAudioElement|null=null;
const message=(s:string)=>$('message').textContent=s;
function clearPrediction(){accepted=null;$('result').textContent='—';$('confidence').textContent='—';$<HTMLButtonElement>('speak').disabled=true;}
function clearFeatures(){for(let i=0;i<5;i++)$('bend-'+i).style.height='0%';$('normal').textContent='Palm normal: —';}
function stop(){running=false;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=undefined;video.srcObject=null;latest=null;lastVideoTime=-1;gate.reset();clearPrediction();clearFeatures();audio?.pause();ctx.clearRect(0,0,canvas.width,canvas.height);$('empty').hidden=false;$('camera-state').textContent='CAMERA OFF';$<HTMLButtonElement>('start').disabled=false;$<HTMLButtonElement>('stop').disabled=true;$<HTMLButtonElement>('capture').disabled=true;$('latency').textContent='—';}
async function speak(label:string){
 if(!/^([1-9]|10)$/.test(label))return;
 audio?.pause();audio=new Audio(`${import.meta.env.BASE_URL}audio/${label}.mp3`);
 try{await audio.play();message('');}catch{message(`Audio unavailable. Add a Cantonese recording at public/audio/${label}.mp3.`);}
}
function frame(now:number){
 if(!running)return;
 try{
  if(video.readyState>=2 && video.currentTime!==lastVideoTime && now-lastInference>=66){
   lastVideoTime=video.currentTime;lastInference=now;const begin=performance.now();
   const r=landmarker!.detectForVideo(video,now);
   canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.clearRect(0,0,canvas.width,canvas.height);
   latest=null;$<HTMLButtonElement>('capture').disabled=true;
   if(r.landmarks.length===1 && r.worldLandmarks.length===1){
    drawing.drawConnectors(r.landmarks[0],HandLandmarker.HAND_CONNECTIONS,{color:'#c6e89f',lineWidth:3});drawing.drawLandmarks(r.landmarks[0],{color:'#f6e5b7',radius:3});
    const hand=r.handedness[0][0].categoryName,points=r.worldLandmarks[0],f=features(points,hand);
    latest={points:points.map(({x,y,z})=>({x,y,z})),hand,time:now};$<HTMLButtonElement>('capture').disabled=false;
    for(let i=0;i<5;i++)$('bend-'+i).style.height=`${100*(1-(f.bends[i*2]+f.bends[i*2+1])/2)}%`;
    $('normal').textContent=`Palm normal: ${[f.normal.x,f.normal.y,f.normal.z].map(v=>v.toFixed(2)).join(' / ')}`;
    $('camera-state').textContent=`LIVE / ${hand.toUpperCase()} HAND`;
    if(model){const p=predict(model,f[model.feature_set]);$('confidence').textContent=`${(p.confidence*100).toFixed(0)}%`;
     // Prototype threshold, not a calibrated guarantee of correctness.
     const eligible=p.confidence>=.8 && p.label!=='unknown'?p.label:null;
     const event=gate.update(eligible,now);
     if(!eligible){clearPrediction();$('status').textContent='Uncertain pose. Hold a supported gesture.';}
     else{if(accepted!==eligible){accepted=null;$('result').textContent='—';$<HTMLButtonElement>('speak').disabled=true;}$('status').textContent=accepted?'Stable prediction. Ready to speak.':'Hold your pose to confirm…';}
     if(eligible && gate.isStable(eligible,now)){accepted=eligible;$('result').textContent=eligible;$<HTMLButtonElement>('speak').disabled=false;$('status').textContent='Stable prediction. Ready to speak.';}
     if(event){accepted=event;$('result').textContent=event;$<HTMLButtonElement>('speak').disabled=false;$('status').textContent='Stable prediction. Ready to speak.';if($<HTMLInputElement>('auto').checked)void speak(event);}
    }else{$('status').textContent='Hand detected. Load a trained model to recognize numbers.';}
   }else{clearFeatures();clearPrediction();gate.update(null,now);$('camera-state').textContent='LIVE / WAITING';$('status').textContent=r.landmarks.length>1?'Use one hand only. Two-hand poses are not supported yet.':'No hand detected. Place one hand in view.';}
   $('latency').textContent=`${Math.round(performance.now()-begin)} ms`;
  }
 }catch(e){latest=null;gate.reset();clearPrediction();clearFeatures();$<HTMLButtonElement>('capture').disabled=true;message(`Frame skipped: ${e instanceof Error?e.message:String(e)}`);}
 raf=requestAnimationFrame(frame);
}
$('start').onclick=async()=>{
 if(starting||running)return;starting=true;$<HTMLButtonElement>('start').disabled=true;message('Loading hand tracker…');
 try{
  if(!landmarker){const files=await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}vendor/wasm`);landmarker=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}models/hand_landmarker.task`,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6});}
  stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720}},audio:false});video.srcObject=stream;await video.play();
  running=true;$('empty').hidden=true;$<HTMLButtonElement>('stop').disabled=false;message('');raf=requestAnimationFrame(frame);
 }catch(e){stop();message(`Could not start: ${e instanceof Error?e.message:String(e)}. Check camera permission and run npm run assets.`);}finally{starting=false;}
};
$('stop').onclick=()=>{stop();$('status').textContent='Camera stopped.';};
$('speak').onclick=()=>{if(accepted)void speak(accepted);};
$('capture').onclick=()=>{
 const person=$<HTMLInputElement>('person').value.trim(),session=$<HTMLInputElement>('session').value.trim();
 if(!person||!session){message('Enter a participant and session before saving.');return;}
 const now=performance.now();if(!latest||now-latest.time>300){message('Wait for a fresh, visible hand.');return;}
 if(now-lastCapture<1000){message('Re-form your gesture before saving another sample.');return;}
 samples.push({schema_version:1,feature_version:FEATURE_VERSION,sample_id:crypto.randomUUID(),person_id:person,session_id:session,source_id:'webcam',label:$<HTMLSelectElement>('label').value,handedness:latest.hand,world_landmarks:latest.points,created_at:new Date().toISOString()});lastCapture=now;
 $<HTMLButtonElement>('export').disabled=false;$('export').textContent=`Export JSONL (${samples.length})`;message(`Saved sample ${samples.length}. Export to keep your work.`);
};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([samples.map(s=>JSON.stringify(s)).join('\n')+'\n'],{type:'application/x-ndjson'}));const a=document.createElement('a');a.href=url;a.download=`gesture-samples-${Date.now()}.jsonl`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$<HTMLInputElement>('model').onchange=async e=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;try{if(file.size>10_000_000)throw Error('Model exceeds 10 MB');const next=validateModel(JSON.parse(await file.text()));model=next;gate.reset();clearPrediction();$('model-status').textContent=`${model.classes.length} classes · ${model.feature_set} features`;$('status').textContent='Model loaded. Start the camera and hold a gesture.';message('');}catch(err){message(`Model not loaded: ${err instanceof Error?err.message:String(err)}`);}};
window.addEventListener('pagehide',()=>{stop();landmarker?.close();});
window.addEventListener('beforeunload',e=>{if(samples.length){e.preventDefault();}});
