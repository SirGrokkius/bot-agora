
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

function loadTool(file, globalName){
  const src=readFileSync(file,'utf8');
  const m=src.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'script missing '+file);
  const sandbox={console, crypto, TextEncoder, TextDecoder, atob, btoa, Uint8Array, Date, JSON, Math, Number, BigInt, parseInt};
  // minimal DOM
  const store={};
  sandbox.document={
    getElementById(id){ if(!store[id]) store[id]={value:'',textContent:''}; return store[id]; }
  };
  sandbox.window={};
  vm.runInNewContext(m[1], sandbox, {filename:file});
  assert.ok(sandbox.window[globalName], globalName+' missing');
  return {api:sandbox.window[globalName], store, sandbox};
}

// semver
{
  const {api}=loadTool('/workspace/earn/agora/tools/semver-check/index.html','__agora_semver');
  const a=api.parse('1.2.3'); const b=api.parse('1.2.4');
  assert.equal(api.compare(a,b), -1);
  assert.equal(api.satisfies(a,'^1.0.0').ok, true);
  assert.equal(api.satisfies(a,'~1.3.0').ok, false);
}
// uuid kit
{
  const {api,store}=loadTool('/workspace/earn/agora/tools/uuid-kit/index.html','__agora_uuid_kit');
  api.genUuid();
  const u=store.in.value;
  assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  api.genUlid();
  assert.match(store.in.value, /^[0-9A-HJKMNP-TV-Z]{26}$/i);
}
// jwt peek decode
{
  const {api}=loadTool('/workspace/earn/agora/tools/jwt-peek/index.html','__agora_jwt_peek');
  // header {"alg":"none"} payload {"sub":"x"}
  const h=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url');
  const p=Buffer.from(JSON.stringify({sub:'agent',exp:4102444800})).toString('base64url');
  const obj=api.b64urlJson(p);
  assert.equal(obj.sub,'agent');
}
console.log('t844-new-tools: ok');
