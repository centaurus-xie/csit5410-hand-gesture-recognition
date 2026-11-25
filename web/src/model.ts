import {FEATURE_VERSION} from './features';
export type Network = {classes:string[];mean:number[];scale:number[];weights:number[][][];biases:number[][]};
export type Model = Network & {release_name?:string;feature_version:string;feature_set:'coordinates'|'geometry'|'combined'|'shape'};
export function validateModel(v:unknown):Model{
 const m=v as Model;
 if(!m || m.feature_version!==FEATURE_VERSION)throw Error('Unsupported feature version');
 const size={coordinates:63,geometry:20,combined:83,shape:62}[m.feature_set];
 if(!size || !Array.isArray(m.classes)||m.classes.length<3||new Set(m.classes).size!==m.classes.length||m.classes.some(x=>!/^([0-9]|10|unknown)$/.test(x)))throw Error('Invalid model classes');
 validateNetwork(m, size);
 return m;
}
export function validateNetwork(m:Network,size:number){
 const finite=(a:unknown):a is number[]=>Array.isArray(a)&&a.every(x=>typeof x==='number'&&Number.isFinite(x));
 if(!finite(m.mean)||!finite(m.scale)||m.mean.length!==size||m.scale.length!==size||m.scale.some(x=>x<=0))throw Error('Invalid model scaler');
 if(!Array.isArray(m.weights)||!Array.isArray(m.biases)||m.weights.length!==m.biases.length||!m.weights.length||m.weights.length>8)throw Error('Invalid layers');
 let input=size;
 m.weights.forEach((w,i)=>{const b=m.biases[i];if(!finite(b)||!b.length||b.length>1024||!Array.isArray(w)||w.length!==input||w.some(row=>!finite(row)||row.length!==b.length))throw Error('Invalid layer dimensions');input=b.length;});
 if(input!==m.classes.length)throw Error('Output class mismatch');
 return m;
}
export function predict(m:Network,vector:number[]){
 if(vector.length!==m.mean.length||vector.some(v=>!Number.isFinite(v)))throw Error('Invalid feature vector');
 let a=vector.map((v,i)=>(v-m.mean[i])/m.scale[i]);
 m.weights.forEach((w,l)=>{a=m.biases[l].map((b,j)=>b+a.reduce((s,v,i)=>s+v*w[i][j],0));if(l<m.weights.length-1)a=a.map(v=>Math.max(0,v));});
 if(a.some(v=>!Number.isFinite(v)))throw Error('Nonfinite model output');
 const max=Math.max(...a), e=a.map(x=>Math.exp(x-max)),sum=e.reduce((a,b)=>a+b,0), probs=e.map(x=>x/sum);
 const index=probs.indexOf(Math.max(...probs));return {label:m.classes[index],confidence:probs[index],probabilities:probs};
}
export class StablePrediction{
 private candidate:string|null=null;private since=0;private latched:string|null=null;private absentSince:number|null=null;
 constructor(private readonly holdMs = 600, private readonly releaseMs = 350) {}
 isStable(label:string,time:number){return this.candidate===label && this.latched===label && time-this.since>=this.holdMs;}
 reset(){this.candidate=null;this.since=0;this.latched=null;this.absentSince=null;}
 update(label:string|null,time:number){
  if(label===null){this.candidate=null;if(this.absentSince===null)this.absentSince=time;if(time-this.absentSince>=this.releaseMs)this.latched=null;return null;}
  this.absentSince=null;
  if(this.candidate!==label){this.candidate=label;this.since=time;return null;}
  if(time-this.since>=this.holdMs && this.latched!==label){this.latched=label;return label;}return null;
 }
}
