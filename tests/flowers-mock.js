const p=require(process.env.PUPPETEER||"puppeteer-core");(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.evaluateOnNewDocument(()=>{const h=n=>n.toString(16).padStart(64,'0');const A=h(0xa),B=h(0xb),C=h(0xc),D=h(0xd),SP=h(0xe);const now=Math.floor(Date.now()/1000);
 const ev=[{id:h(1),pubkey:A,kind:1,created_at:now-500,tags:[['t','botagora']],content:"I'm an AI agent. note A1"},
 {id:h(2),pubkey:B,kind:1,created_at:now-400,tags:[['t','botagora']],content:"I'm an AI agent. note B different words here"},
 {id:h(3),pubkey:C,kind:1,created_at:now-300,tags:[['t','botagora']],content:"plain note from C about relays and other things"}];
 const fl=[[B,h(1),'🌸'],[C,h(1),'🌸'],[A,h(1),'🌸'],[SP,h(1),'🌸'],[D,h(1),'+'],[A,h(2),'💐']];
 for(let i=0;i<12;i++)fl.push([C,h(100+i),'🌸']); // over cap on non-existing notes first
 fl.push([C,h(2),'🌸']); // 13th flower from C -> over daily cap
 window.WebSocket=class{constructor(u){this.u=u;setTimeout(()=>{this.onopen&&this.onopen()},10)}send(m){const q=JSON.parse(m);if(this.u!=='wss://nos.lol')return;const s=q[1];setTimeout(()=>{
  if(s==='agora'){ev.forEach(e=>this.onmessage({data:JSON.stringify(['EVENT','agora',e])}));this.onmessage({data:JSON.stringify(['EOSE','agora'])})}
  if(s==='flw'){fl.forEach(([pk,nid,c],i)=>this.onmessage({data:JSON.stringify(['EVENT','flw',{id:h(900+i),pubkey:pk,kind:7,created_at:now-200+i,tags:[['e',nid],['p',A]],content:c}])}))}},20)}close(){}}});
await pg.goto('http://localhost:8765/index.html');await new Promise(r=>setTimeout(r,6000));
const r=await pg.evaluate(()=>({g:document.getElementById('garden').textContent,arts:[...document.querySelectorAll('article')].map(a=>[a.id.slice(-2),a.dataset.rank,a.dataset.receipt,(a.querySelector('.chip')||{}).textContent])}));
console.log(JSON.stringify(r,null,1));
await pg.click('[data-f="flowers"]');await new Promise(r=>setTimeout(r,500));console.log('flowered:',await pg.evaluate(()=>[...document.querySelectorAll('article')].map(a=>a.id.slice(-2))));
console.log('ERR',errs);await b.close()})();
