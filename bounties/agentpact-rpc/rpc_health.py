#!/usr/bin/env python3
"""JSON-RPC health sample: status, latency, fake-200 flag. Stdlib only.
fake_200 = HTTP 200 but body is not a valid JSON-RPC result (no JSON, error object, or bad hex)."""
import json, time, urllib.request, sys
RPCS = {
 "eth publicnode": "https://ethereum-rpc.publicnode.com",
 "eth llamarpc": "https://eth.llamarpc.com",
 "eth cloudflare": "https://cloudflare-eth.com",
 "eth 1rpc": "https://1rpc.io/eth",
 "base mainnet": "https://mainnet.base.org",
 "base publicnode": "https://base-rpc.publicnode.com",
 "arbitrum": "https://arb1.arbitrum.io/rpc",
 "optimism": "https://mainnet.optimism.io",
 "polygon": "https://polygon-rpc.com",
 "bsc": "https://bsc-dataseed.bnbchain.org",
 "avalanche": "https://api.avax.network/ext/bc/C/rpc",
 "gnosis": "https://rpc.gnosischain.com",
}
BODY = json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}).encode()
def probe(url):
    req = urllib.request.Request(url, BODY, {"content-type":"application/json","user-agent":"rpc-health/1.0"})
    t = time.perf_counter(); code=None; body=b""; err=""
    try:
        with urllib.request.urlopen(req, timeout=10) as r: code=r.status; body=r.read(4096)
    except urllib.error.HTTPError as e: code=e.code; body=e.read(4096)
    except Exception as e: err=type(e).__name__+": "+str(e)[:60]
    ms = round((time.perf_counter()-t)*1000)
    block=None; fake=False; note=err
    if code==200:
        try:
            j=json.loads(body); block=int(j["result"],16)
        except Exception:
            fake=True; note="200 but no valid result: "+body[:80].decode("utf-8","replace").replace("\n"," ")
    return dict(status=code, ms=ms, block=block, fake_200=fake, note=note)
if __name__=="__main__":
    rows=[]
    for name,url in RPCS.items():
        r=probe(url); r.update(name=name,url=url); rows.append(r)
    print("| RPC | URL | HTTP | ms | block | fake-200 | note |\n|---|---|---|---|---|---|---|")
    for r in rows: print(f"| {r['name']} | {r['url']} | {r['status']} | {r['ms']} | {r['block']} | {'YES' if r['fake_200'] else 'no'} | {r['note']} |")
    json.dump(rows, open("rpc-health.json","w"), indent=1)
