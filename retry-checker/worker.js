// Cloudflare Worker: POST /check with JSON body -> verdict JSON. Staged only.
const SAFE=["GET","HEAD","OPTIONS"],CLIENT=[400,401,403,404,409,410,422];
function check({method="GET",idempotency_enforced=false,op="read",failure="status",status=null}={}){
 const m=String(method).toUpperCase(),r=[];
 const out=(v,why)=>{r.push(why);
  if(status===429||status===503)r.push("Honor Retry-After before retrying.");
  if(v==="safe_to_retry"&&!SAFE.includes(m)&&idempotency_enforced)r.push("Reuse the SAME Idempotency-Key on every retry.");
  if(!idempotency_enforced&&!SAFE.includes(m))r.push("An Idempotency-Key header alone is not a guarantee unless the server enforces it.");
  return {verdict:v,reasons:r};};
 if(CLIENT.includes(status))return out("never_auto_retry","Client error; retrying will not fix it.");
 if(SAFE.includes(m))return out("safe_to_retry","Safe method with no side effects.");
 if(failure==="connect_fail")return out("safe_to_retry","Connection failed before the request was sent.");
 if(status===429||status===503){const ok=op==="read"||idempotency_enforced||m==="PUT"||m==="DELETE";return out(ok?"safe_to_retry":"reconcile_first","Server asked us to back off.");}
 if(idempotency_enforced)return out("safe_to_retry","Server documents idempotency-key enforcement.");
 if(op==="payment")return out("never_auto_retry","Payment without enforced idempotency: duplicate charge risk.");
 if(failure==="read_timeout"||(status||0)>=500)return out("reconcile_first","Ambiguous outcome: the write may have been applied. Look it up first.");
 if(m==="PUT"||m==="DELETE")return out("safe_to_retry","PUT/DELETE are idempotent by HTTP semantics.");
 return out("reconcile_first","Unknown outcome for a non-idempotent write.");
}
export default { async fetch(req) {
  const u = new URL(req.url), h = {"content-type":"application/json","access-control-allow-origin":"*"};
  if (req.method === "OPTIONS") return new Response(null, {headers:{...h,"access-control-allow-methods":"POST","access-control-allow-headers":"content-type"}});
  if (u.pathname !== "/check" || req.method !== "POST") return new Response(JSON.stringify({error:"POST /check"}), {status:404, headers:h});
  let b; try { b = await req.json(); } catch { return new Response(JSON.stringify({error:"bad json"}), {status:400, headers:h}); }
  return new Response(JSON.stringify(check(b)), {headers:h});
}};
