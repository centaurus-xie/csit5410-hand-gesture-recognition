import { FEATURE_VERSION, type Point } from './features';

type Purpose = 'train' | 'val' | 'test';
type Entry = {
 schema_version: 1; feature_version: string; sample_id: string; person_id: string;
 session_id: string; source_id: string; created_at: string; dataset_split: Purpose;
 predicted_label: string; confidence: number; model_name: string; handedness: string;
 world_landmarks: Point[]; thumbnail: string; label: string | null; synced?: boolean; previous_label?: string;
};
export const reviewPanel = `
<section class="panel" id="entry-panel" aria-labelledby="review-heading" hidden>
 <h2 id="review-heading">Digit collection</h2>
 <button id="session-settings" class="secondary">Session settings</button><p class="small" id="session-summary">Set up a collection session.</p>
 <dialog id="session-dialog" aria-labelledby="settings-title"><form method="dialog">
 <h2 id="settings-title">Collection session</h2>
 <label>Participant<input id="person" placeholder="p01" required pattern=".*\\S.*" maxlength="40"></label>
 <label>Session<input id="session" placeholder="s01" required pattern=".*\\S.*" maxlength="40"></label>
 <label>Dataset split<select id="case-split"><option value="train">Training</option><option value="val">Validation</option><option value="test">Held-out test</option></select></label>
 <div class="toolbar"><button value="apply">Apply</button><button value="cancel" class="secondary" formnovalidate>Cancel</button></div></form></dialog>
 <div class="divider"></div><label>Gesture label<select id="label">${Array.from({length:11},(_,i)=>`<option>${i}</option>`).join('')}<option>unknown</option></select></label>
 <div class="toolbar"><button id="capture" disabled>Save sample</button></div>
 <div class="toolbar"><label><input type="checkbox" id="case-auto">Record stable digits</label></div>
 <p id="case-status" class="small" role="status"></p>
 <div id="case-card" hidden><img id="case-photo" width="144" height="144" alt="Hand at the moment of recognition">
 <p id="case-detail"></p><label>Correct label<select id="case-label"></select></label>
 <div class="toolbar"><button id="case-approve">Confirm label</button><button id="case-drop" class="secondary">Discard case</button></div></div>
 <p id="case-count" aria-live="polite"></p>
 <details id="edit-panel"><summary>Correct a confirmed label</summary>
 <label>Confirmed sample<select id="edit-sample"></select></label>
 <label>Correct digit<select id="edit-label"></select></label>
 <button id="edit-save">Save correction</button></details>
 <details><summary>Dataset tools</summary><div class="toolbar"><button id="case-export" disabled>Export reviewed split</button><button id="case-clear" class="secondary" disabled>Clear reviewed split</button></div></details>
</section>`;

const prefix = 'gesture-review-v1:';
const el = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;

function cropHand(video: HTMLVideoElement, points: Point[]) {
 const w = video.videoWidth, h = video.videoHeight;
 const xs = points.map(p => p.x * w), ys = points.map(p => p.y * h);
 const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
 const size = Math.max(right-left, bottom-top, 1) * 1.35;
 const canvas = document.createElement('canvas');
 canvas.width = canvas.height = 144;
 const ctx = canvas.getContext('2d')!;
 ctx.drawImage(video, (left+right-size)/2, (top+bottom-size)/2, size, size, 0, 0, 144, 144);
 return canvas.toDataURL('image/jpeg', .65);
}

export function setupReview() {
 const entries = new Map<string, Entry>();
 const enabled = el<HTMLInputElement>('case-auto'), split = el<HTMLSelectElement>('case-split');
 const corrected = el<HTMLSelectElement>('case-label'), status = el('case-status');
 for (const label of [...Array.from({length:11}, (_,i)=>String(i)), 'unknown']) corrected.add(new Option(label,label));
 const person = el<HTMLInputElement>('person'), session = el<HTMLInputElement>('session');
 let current: Entry | undefined;
 let syncing = false;
 const selected = () => [...entries.values()].filter(row => row.dataset_split === split.value);
 const history = el<HTMLSelectElement>('edit-sample'), replacement = el<HTMLSelectElement>('edit-label');
 for (const option of Array.from(corrected.options)) replacement.add(new Option(option.text,option.value));
 history.onchange = () => { replacement.value = entries.get(history.value)?.label ?? ''; };
 function render() {
  const rows = selected(), pending = rows.filter(row => row.label === null);
  const confirmed = rows.filter(row => row.label !== null).reverse();
  const previous = history.value;
  history.replaceChildren(...confirmed.map(row => new Option(
   `${new Date(row.created_at).toLocaleTimeString()} · ${row.person_id}/${row.session_id} · ${row.label}`,row.sample_id)));
  if (confirmed.some(row=>row.sample_id===previous)) history.value=previous;
  else replacement.value=confirmed[0]?.label ?? '';
  el('edit-panel').hidden = !confirmed.length;
  el<HTMLButtonElement>('edit-save').disabled = syncing;
  const next = pending[0];
  el('case-card').hidden = !next;
  if (next && current?.sample_id !== next.sample_id) {
   el<HTMLImageElement>('case-photo').src = next.thumbnail;
   corrected.value = next.predicted_label;
   el('case-detail').textContent = `${next.person_id} / ${next.session_id} · predicted ${next.predicted_label} (${(100*next.confidence).toFixed(1)}%)`;
  }
  current = next;
  const waiting = rows.filter(row => row.label !== null && !row.synced).length;
  el<HTMLButtonElement>('case-sync').disabled = syncing || ![...entries.values()].some(r => r.label !== null && !r.synced);
  el<HTMLButtonElement>('case-clear').disabled = !rows.some(row=>row.synced);
  el('case-count').textContent = `${pending.length} awaiting review · ${rows.length-pending.length} confirmed · ${waiting} awaiting project save`;
  el<HTMLButtonElement>('case-export').disabled = rows.length === pending.length;
 }
 function save(row:Entry) {
  try {
   localStorage.setItem(prefix+row.sample_id, JSON.stringify(row));
   entries.set(row.sample_id,row);
   render();
   return true;
  } catch {
   enabled.checked = false;
   status.textContent = 'Case could not be saved. Recording paused. Export and clear confirmed cases to free space.';
  }
 }
 try {
  for (const key of Object.keys(localStorage).filter(k=>k.startsWith(prefix))) {
   const row:Entry = JSON.parse(localStorage.getItem(key)!);
   entries.set(row.sample_id,row);
  }
  const ordered = [...entries.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at));
  entries.clear();
  for(const row of ordered) entries.set(row.sample_id,row);
 } catch { enabled.disabled = true; status.textContent = 'Local review storage unavailable.'; }
 render();
 function checkIdentity() {
  if (!person.value.trim() || !session.value.trim()) {
   enabled.checked = false;
   status.textContent = 'Open Session settings and enter a participant and session.';
   return false;
  }
  return true;
 }
 enabled.onchange = () => {
  if (enabled.checked && checkIdentity()) status.textContent = 'Recording enabled for Numbers mode.';
  else if (!enabled.checked && person.value.trim() && session.value.trim()) status.textContent = 'Recording paused.';
 };
 split.onchange = () => { if (el<HTMLDialogElement>('session-dialog').open) return; enabled.checked=false; status.textContent=''; render(); };
 async function sync() {
  if (syncing) return;
  syncing = true; render();
  const feedback = el('project-status');
  feedback.textContent = 'Saving confirmed samples to this project…';
  const attempted = new Set<string>();
  try {
   while (true) {
    const row = [...entries.values()].find(r => r.label !== null && !r.synced && !attempted.has(r.sample_id));
    if (!row) break;
    attempted.add(row.sample_id);
    try {
     const {thumbnail,synced,...payload} = row;
     const response = await fetch('/api/digit-captures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const result = await response.json();
     if (!response.ok || result.saved !== true) throw Error(result.error || 'Project save unavailable');
     if (!save({...row,previous_label:undefined,synced:true})) throw Error('Project saved, browser receipt unavailable. Retry is safe.');
    } catch (err) {
     feedback.textContent = `Case retained in browser. ${err instanceof Error ? err.message : err} Open the local app and retry.`;
     continue;
    }
   }
   if (![...entries.values()].some(r=>r.label!==null && !r.synced)) feedback.textContent = 'Saved to this project. You can capture the next sample.';
  } finally { syncing=false; render(); }
 }
 el('edit-save').onclick = () => {
  const row = entries.get(history.value);
  if (!row?.label || syncing || replacement.value === row.label) return;
  if (save({...row,label:replacement.value,previous_label:row.previous_label ?? row.label,synced:false})) void sync();
 };
 el('case-sync').onclick = () => void sync();
 el('case-approve').onclick = () => { if (current && save({...current,label:corrected.value})) void sync(); };
 function remove(row:Entry) { localStorage.removeItem(prefix+row.sample_id); entries.delete(row.sample_id); }
 el('case-drop').onclick = () => { if(current) remove(current); render(); };
 el('case-clear').onclick = () => {
  if(!window.confirm('Clear project-saved cases in this split from this browser? The project dataset keeps them.')) return;
  selected().filter(row=>row.synced).forEach(remove); render();
 };
 el('case-export').onclick = () => {
  const lines = selected().filter(row=>row.label!==null).map(({thumbnail,synced,...sample})=>JSON.stringify(sample));
  const url = URL.createObjectURL(new Blob([lines.join('\n')+'\n'], {type:'application/x-ndjson'}));
  const link = document.createElement('a');
  link.href=url; link.download=`gesture-reviewed-${split.value}-${Date.now()}.jsonl`; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 function manual(world: Point[], hand:string, label:string) {
  if (!checkIdentity()) return false;
  const stored = save({schema_version:1,feature_version:FEATURE_VERSION,sample_id:crypto.randomUUID(),person_id:person.value.trim(),session_id:session.value.trim(),source_id:'webcam',created_at:new Date().toISOString(),dataset_split:split.value as Purpose,label,handedness:hand,world_landmarks:world,thumbnail:'',model_name:'',predicted_label:'',confidence:0});
  if (stored) void sync();
  return stored;
 }
 function capture(prediction:{label:string;confidence:number}, modelName:string, hand:string, world:Point[], image:Point[], video:HTMLVideoElement) {
  if (!enabled.checked || !checkIdentity()) return;
  save({schema_version:1,feature_version:FEATURE_VERSION,sample_id:crypto.randomUUID(),
   person_id:person.value.trim(),session_id:session.value.trim(),source_id:'webcam-stable-digit',
   created_at:new Date().toISOString(),dataset_split:split.value as Purpose,predicted_label:prediction.label,
   confidence:prediction.confidence,model_name:modelName,handedness:hand,world_landmarks:world,
   thumbnail:cropHand(video,image),label:null});
 };
 return {capture,manual};
}
