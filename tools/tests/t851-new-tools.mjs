import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadTool(file, globalName){
  const src=readFileSync(file,'utf8');
  const m=src.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'script missing '+file);
  const sandbox={console, crypto, TextEncoder, TextDecoder, atob, btoa, Uint8Array, Date, JSON, Math, Number, BigInt, parseInt, Object, Array, Set, Map};
  const store={};
  sandbox.document={
    getElementById(id){ if(!store[id]) store[id]={value:'',textContent:''}; return store[id]; }
  };
  sandbox.window={};
  vm.runInNewContext(m[1], sandbox, {filename:file});
  assert.ok(sandbox.window[globalName], globalName+' missing');
  return {api:sandbox.window[globalName], store, sandbox};
}

{
  const {api}=loadTool('/workspace/earn/agora/tools/prompt-delta/index.html','__agora_prompt_delta');
  assert.equal(api.tokenEstimate('one two three four'), Math.ceil(4/0.75));
  assert.equal(api.tokenEstimate(''), 0);
  const d=api.diffLines('a\nb\nc','a\nx\nc');
  assert.ok(d.some(x=>x.t==='del' && x.v==='b'));
  assert.ok(d.some(x=>x.t==='add' && x.v==='x'));
  assert.ok(d.filter(x=>x.t==='ctx').length>=2);
}

{
  const {api}=loadTool('/workspace/earn/agora/tools/schema-drift/index.html','__agora_schema_drift');
  const d=api.driftDiff(
    {type:'object',properties:{name:{type:'string'}},required:['name']},
    {type:'object',properties:{name:{type:'string'},email:{type:'string'}},required:['name','email']}
  );
  assert.ok(d.some(x=>x.includes('email') && x.includes('added')));
  assert.ok(d.some(x=>x.includes('required')));
  assert.equal(api.driftDiff({a:1},{a:1}).length, 0);
}

{
  const {api}=loadTool('/workspace/earn/agora/tools/context-allocator/index.html','__agora_context_allocator');
  const r=api.allocate(200000,12000,4000,1024,2000);
  assert.equal(r.available, 200000-12000-4000-1024);
  assert.equal(r.maxChunks, Math.floor(r.available/2000));
  assert.equal(r.needed, r.maxChunks*2000);
  assert.equal(api.allocate(100,0,0,0,0).error.includes('chunk'), true);
}

console.log('t851-new-tools: ok');
