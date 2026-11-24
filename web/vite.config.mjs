import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('..', import.meta.url));
function install(server) {
 server.middlewares.use('/api/digit-captures', async (req, res) => {
  const finish = (code, body) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(body)); };
  const host = req.headers.host;
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host ?? '') || req.headers.origin !== `http://${host}`) return finish(403,{error:'Open the app on localhost to save to this project.'});
  if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return finish(405,{error:'Expected a JSON POST'});
  let body='';
  try {
   for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>16000) return finish(413,{error:'Sample too large'}); }
   const child=spawn(`${project}/.venv/bin/python`, ['-m','gesture.captures'], {cwd:project,stdio:['pipe','ignore','pipe']});
   let error=''; child.stderr.on('data', chunk=>error+=chunk);
   child.stdin.on('error',()=>{}); child.stdin.end(body);
   child.on('error',()=>finish(503,{error:'Project Python environment unavailable'}));
   child.on('close',code=>{ if(!res.writableEnded) finish(code===0?200:code===2?422:503,code===0?{saved:true}:{error:code===2?error.trim():'Local dataset write failed. Check the project Python environment.'}); });
  } catch { if(!res.writableEnded) finish(500,{error:'Local dataset request interrupted'}); }
 });
}
export default defineConfig({plugins:[{name:'local-digit-captures',configureServer:install,configurePreviewServer:install}]});
