// Run with: node --import tsx scripts/check-model-parity.mjs artifacts/run
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validateModel,predict} from '../web/src/model.ts';
const dir=process.argv[2];if(!dir)throw Error('Pass a training output directory');
const m=validateModel(JSON.parse(readFileSync(join(dir,'classifier.json'),'utf8')));
const p=JSON.parse(readFileSync(join(dir,'parity.json'),'utf8'));
let error=0;
p.vectors.forEach((v,i)=>predict(m,v).probabilities.forEach((x,j)=>{error=Math.max(error,Math.abs(x-p.probabilities[i][j]));}));
if(error>1e-7)throw Error(`Parity failed: ${error}`);
console.log(`MLP Python/browser maximum probability difference: ${error}`);
