// Explicitly promote a validated model, or choose the most recently modified MLP export.
import {readFile, readdir, stat, mkdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
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
const bytes = await readFile(source);
const model = validateModel(JSON.parse(bytes));
const published = new Date().toISOString();
const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0,8);
const filename = `digits-mlp-${model.feature_set}_${published.replace(/:/g,'-')}_${fingerprint}.json`;
const directory = 'web/public/models';
await mkdir(directory,{recursive:true});
const release = JSON.stringify({...model,release_name:filename});
await writeFile(path.join(directory,filename),release);
async function replaceFile(name,contents) {
 const temp = path.join(directory,randomUUID()+'.tmp');
 await writeFile(temp,contents);
 await rename(temp,path.join(directory,name));
}
await replaceFile('default.json',release);
await replaceFile('default-info.json',JSON.stringify({source,filename,classes:model.classes,feature_set:model.feature_set,published_at:published},null,2));
console.log(`Published ${filename}`);
