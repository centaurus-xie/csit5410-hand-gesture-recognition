// Explicitly promote a validated model, or choose the most recently modified MLP export.
import {readFile, readdir, stat, mkdir, copyFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateModel} from '../web/src/model.ts';
async function discover(dir){
 const result=[];
 for(const item of await readdir(dir,{withFileTypes:true})){
  const p=path.join(dir,item.name);
  if(item.isDirectory())result.push(...await discover(p));
  else if(item.name==='classifier.json')result.push(p);
 }
 return result;
}
let source=process.argv[2];
if(!source){
 const candidates=await discover('artifacts');
 const valid=[];
 for(const file of candidates){
  if(file.split(path.sep).includes('smoke'))continue;
  try{validateModel(JSON.parse(await readFile(file,'utf8')));valid.push({file,time:(await stat(file)).mtimeMs});}catch{}
 }
 valid.sort((a,b)=>b.time-a.time);
 if(!valid.length)throw Error('No valid trained MLP found. Train or pass a classifier.json path.');
 source=valid[0].file;
}
const model=validateModel(JSON.parse(await readFile(source,'utf8')));
await mkdir('web/public/models',{recursive:true});
await copyFile(source,'web/public/models/default.json');
await writeFile('web/public/models/default-info.json',JSON.stringify({source,classes:model.classes,feature_set:model.feature_set,published_at:new Date().toISOString()},null,2));
console.log(`Default model published: ${source}`);
