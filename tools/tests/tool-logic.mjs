// Pure logic mirrors of /tools/* (keep in sync). Node test harness.
export function formatValidate(input, mode){
  function coerce(v){
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) return v.slice(1,-1);
    if(v==='true') return true; if(v==='false') return false; if(v==='null'||v==='~') return null;
    if(/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  function parseYamlLite(src){
    const lines=src.replace(/\t/g,'  ').split(/\r?\n/);
    const root={}; const stack=[{indent:-1,obj:root,key:null}];
    const cur=()=>stack[stack.length-1];
    for(let raw of lines){
      if(!raw.trim()||raw.trim().startsWith('#')) continue;
      const indent=raw.match(/^ */)[0].length; let line=raw.trim();
      while(stack.length>1 && indent<=cur().indent) stack.pop();
      const parent=cur();
      if(line.startsWith('- ')){
        const val=line.slice(2).trim(); let arr;
        if(Array.isArray(parent.obj)) arr=parent.obj;
        else if(parent.key!=null){ if(!Array.isArray(parent.obj[parent.key])) parent.obj[parent.key]=[]; arr=parent.obj[parent.key]; }
        else throw new Error('list item with no parent key');
        if(val.includes(':') && !val.startsWith('"') && !val.startsWith("'")){
          const obj={}; arr.push(obj); stack.push({indent,obj,key:null});
          const i=val.indexOf(':'); obj[val.slice(0,i).trim()]=coerce(val.slice(i+1).trim()||'null')==='null'&&val.slice(i+1).trim()===''?null:coerce(val.slice(i+1).trim());
        } else arr.push(coerce(val));
        continue;
      }
      const i=line.indexOf(':'); if(i<0) throw new Error('expected key: value');
      const k=line.slice(0,i).trim(); const v=line.slice(i+1).trim();
      if(v===''){ const obj={}; parent.obj[k]=obj; stack.push({indent,obj,key:null}); parent.key=k; }
      else { parent.obj[k]=coerce(v); parent.key=k; }
    }
    return root;
  }
  try{
    if(mode==='yaml-lite'){ const obj=parseYamlLite(input); return {ok:true,pretty:JSON.stringify(obj,null,2),type:'yaml-lite'}; }
    const obj=JSON.parse(input); return {ok:true,pretty:JSON.stringify(obj,null,2),type:Array.isArray(obj)?'array':typeof obj};
  }catch(e){ return {ok:false,error:String(e.message||e)}; }
}

export function estimateTokens(text, modelHint='gpt'){
  const chars=[...text].length;
  const bytes=new TextEncoder().encode(text).length;
  const words=(text.trim().match(/\S+/g)||[]).length;
  const lines=text.length?text.split(/\r?\n/).length:0;
  const cjk=(text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)||[]).join('').length;
  const ratio=cjk/Math.max(chars,1);
  let div=4; if(modelHint==='code') div=3.5; else if(modelHint==='cjk'||ratio>0.3) div=1.5; else if(ratio>0.1) div=2.5;
  return {chars,bytes,tokens_approx:Math.ceil(chars/div),words,lines,modelHint};
}

export function explainCron(expr){
  const DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MON=['','January','February','March','April','May','June','July','August','September','October','November','December'];
  function parseField(f, min, max){
    if(f==='*') return {every:true, values:null};
    const vals=new Set();
    for(const part of f.split(',')){
      let p=part, step=1;
      if(p.includes('/')){ const [a,b]=p.split('/'); p=a==='*'?`${min}-${max}`:a; step=+b; if(!step||step<1) throw new Error('bad step'); }
      if(p.includes('-')){
        let [lo,hi]=p.split('-').map(Number);
        if(!(lo>=min&&hi<=max&&lo<=hi)) throw new Error('range');
        for(let i=lo;i<=hi;i+=step) vals.add(i);
      } else {
        let v=+p; if(!(v>=min&&v<=max)) throw new Error('bounds');
        if(step>1) for(let i=v;i<=max;i+=step) vals.add(i); else vals.add(v);
      }
    }
    return {every:false, values:[...vals].sort((a,b)=>a-b)};
  }
  const parts=String(expr).trim().split(/\s+/);
  if(parts.length!==5) return {ok:false,error:'need 5 fields'};
  try{
    const fields={minute:parseField(parts[0],0,59),hour:parseField(parts[1],0,23),dom:parseField(parts[2],1,31),mon:parseField(parts[3],1,12),dow:parseField(parts[4],0,7)};
    if(fields.dow.values) fields.dow.values=[...new Set(fields.dow.values.map(v=>v===7?0:v))].sort((a,b)=>a-b);
    const pad=n=>String(n).padStart(2,'0');
    let human;
    if(fields.minute.every&&fields.hour.every) human='Every minute';
    else if(fields.minute.values?.length===1&&fields.hour.values?.length===1) human=`At ${pad(fields.hour.values[0])}:${pad(fields.minute.values[0])}`;
    else human=`Minutes ${fields.minute.every?'*':fields.minute.values.join(',')} · Hours ${fields.hour.every?'*':fields.hour.values.join(',')}`;
    if(!fields.dow.every) human += ` on ${fields.dow.values.map(d=>DOW[d]).join(', ')}`;
    if(!fields.dom.every) human += ` (day-of-month ${fields.dom.values.join(',')})`;
    if(!fields.mon.every) human += ` in ${fields.mon.values.map(m=>MON[m]).join(', ')}`;
    if(fields.dow.every&&fields.dom.every&&fields.mon.every && human.startsWith('At ')) human += ' every day';
    return {ok:true,fields,human,nextHints:['ok']};
  }catch(e){ return {ok:false,error:String(e.message||e)}; }
}

function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function backoffSchedule({baseMs=200,maxMs=30000,attempts=5,jitter='none',factor=2,seed=42}={}){
  const rand=mulberry32(seed>>>0); const out=[]; let cum=0;
  for(let i=0;i<attempts;i++){
    let cap=Math.min(maxMs, baseMs*Math.pow(factor,i)); let wait;
    if(jitter==='full') wait=rand()*cap; else if(jitter==='equal') wait=cap/2+rand()*(cap/2); else wait=cap;
    wait=Math.floor(wait); cum+=wait; out.push({attempt:i+1,waitMs:wait,cumulativeMs:cum,capMs:Math.floor(cap)});
  }
  return out;
}

export function convertSatsUsd({sats=null,usd=null,rateUsdPerBtc}={}){
  const rate=+rateUsdPerBtc; if(!(rate>0)||!Number.isFinite(rate)) return {ok:false,error:'rate'};
  if(sats!=null&&sats!==''&&Number.isFinite(+sats)){ const s=Math.trunc(+sats); if(s<0)return{ok:false,error:'sats'}; const btc=s/1e8; return {ok:true,sats:s,btc,usd:+(btc*rate).toFixed(8),rate}; }
  if(usd!=null&&usd!==''&&Number.isFinite(+usd)){ const u=+usd; if(u<0)return{ok:false,error:'usd'}; const btc=u/rate; return {ok:true,sats:Math.round(btc*1e8),btc,usd:u,rate}; }
  return {ok:false,error:'need sats or usd'};
}

function luhn(s){ const d=[...s].filter(c=>/\d/.test(c)).map(Number); if(d.length<13||d.length>16)return false; let t=0; for(let i=0;i<d.length;i++){let x=d[d.length-1-i]; if(i%2){x*=2;if(x>9)x-=9;} t+=x;} return t%10===0; }
export function redactText(text){
  const RULES=[
    ['aws_access_key',/\bAKIA[0-9A-Z]{16}\b/g],
    ['github_token',/\bgh[pousr]_[A-Za-z0-9]{36,}\b/g],
    ['private_key',/-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
    ['email',/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
    ['us_ssn',/\b\d{3}-\d{2}-\d{4}\b/g],
    ['credit_card',/\b(?:\d[ -]?){13,16}\b/g],
  ];
  let redacted=text; const hits=[];
  for(const [kind,rx] of RULES){
    let count=0;
    redacted=redacted.replace(new RegExp(rx.source,rx.flags), m=>{
      if(kind==='credit_card'&&!luhn(m)) return m;
      if(kind==='email'){ return '***@'+m.slice(m.indexOf('@')+1); }
      count++; return `[REDACTED:${kind}]`;
    });
    if(kind==='email'){ const n=(text.match(new RegExp(rx.source,'g'))||[]).length; if(n) hits.push({kind,count:n}); }
    else if(count) hits.push({kind,count});
  }
  return {redacted,hits,total:hits.reduce((a,h)=>a+h.count,0)};
}

// bech32
const CHARSET='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values){ const GEN=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3]; let chk=1; for(const v of values){ const b=chk>>25; chk=((chk&0x1ffffff)<<5)^v; for(let i=0;i<5;i++) if((b>>i)&1) chk^=GEN[i]; } return chk; }
function hrpExpand(hrp){ const ret=[]; for(const c of hrp) ret.push(c.charCodeAt(0)>>5); ret.push(0); for(const c of hrp) ret.push(c.charCodeAt(0)&31); return ret; }
function verifyChecksum(hrp,data){ return polymod(hrpExpand(hrp).concat(data))===1; }
function createChecksum(hrp,data){ const values=hrpExpand(hrp).concat(data).concat([0,0,0,0,0,0]); const mod=polymod(values)^1; const ret=[]; for(let p=0;p<6;p++) ret.push((mod>>5*(5-p))&31); return ret; }
function convertBits(data,from,to,pad){ let acc=0,bits=0; const ret=[],maxv=(1<<to)-1; for(const value of data){ if(value<0||value>>from) return null; acc=(acc<<from)|value; bits+=from; while(bits>=to){ bits-=to; ret.push((acc>>bits)&maxv);} } if(pad){ if(bits>0) ret.push((acc<<(to-bits))&maxv);} else if(bits>=from||((acc<<(to-bits))&maxv)) return null; return ret; }
function hexToBytes(hex){ hex=hex.toLowerCase().replace(/^0x/,'').trim(); if(!/^[0-9a-f]*$/.test(hex)||hex.length%2) throw new Error('bad hex'); const out=[]; for(let i=0;i<hex.length;i+=2) out.push(parseInt(hex.slice(i,i+2),16)); return out; }
function bytesToHex(bytes){ return bytes.map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function hexToNostr(hex,prefix){ try{ const bytes=hexToBytes(hex); if(bytes.length!==32) return {ok:false,error:'len'}; const data=convertBits(bytes,8,5,true); let s=prefix+'1'; for(const d of data.concat(createChecksum(prefix,data))) s+=CHARSET[d]; return {ok:true,hex:bytesToHex(bytes),bech:s,prefix}; }catch(e){ return {ok:false,error:String(e.message||e)}; } }
export function nostrToHex(bech){ try{ bech=bech.trim(); if(bech!==bech.toLowerCase()&&bech!==bech.toUpperCase()) throw new Error('mixed'); bech=bech.toLowerCase(); const pos=bech.lastIndexOf('1'); const hrp=bech.slice(0,pos); const data=[]; for(const c of bech.slice(pos+1)){ const i=CHARSET.indexOf(c); if(i<0) throw new Error('char'); data.push(i);} if(!verifyChecksum(hrp,data)) throw new Error('checksum'); const bytes=convertBits(data.slice(0,-6),5,8,false); if(!bytes||bytes.length!==32) return {ok:false,error:'len'}; return {ok:true,hex:bytesToHex(bytes),bech,prefix:hrp}; }catch(e){ return {ok:false,error:String(e.message||e)}; } }
