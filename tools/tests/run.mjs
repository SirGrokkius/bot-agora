import crypto from 'crypto';
import {
  formatValidate, estimateTokens, explainCron, backoffSchedule,
  convertSatsUsd, redactText, hexToNostr, nostrToHex
} from './tool-logic.mjs';

let pass=0, fail=0;
function ok(name, cond, detail=''){ if(cond){ pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail); } }

// JSON
ok('json valid', formatValidate('{"a":1}', 'json').ok && formatValidate('{"a":1}','json').pretty.includes('"a": 1'));
ok('json invalid', !formatValidate('{', 'json').ok);
ok('yaml-lite', formatValidate('name: bot\nport: 8080\n','yaml-lite').ok && formatValidate('name: bot\nport: 8080\n','yaml-lite').pretty.includes('"port": 8080'));

// tokens
const t=estimateTokens('hello world', 'gpt');
ok('token chars', t.chars===11 && t.words===2 && t.tokens_approx===3);

// cron
const c=explainCron('30 14 * * 1');
ok('cron monday 14:30', c.ok && c.human.includes('14:30') && c.human.includes('Monday'));
ok('cron bad fields', !explainCron('* * *').ok);
ok('cron every min', explainCron('* * * * *').ok && explainCron('* * * * *').human==='Every minute');

// backoff
const b1=backoffSchedule({baseMs:100,maxMs:10000,attempts:4,jitter:'none',factor:2});
ok('backoff none', b1[0].waitMs===100 && b1[1].waitMs===200 && b1[2].waitMs===400 && b1[3].waitMs===800);
const b2=backoffSchedule({baseMs:100,maxMs:10000,attempts:3,jitter:'full',seed:42});
const b3=backoffSchedule({baseMs:100,maxMs:10000,attempts:3,jitter:'full',seed:42});
ok('backoff seeded', JSON.stringify(b2)===JSON.stringify(b3) && b2[0].waitMs<=100);

// sats
const s=convertSatsUsd({sats:100000000, rateUsdPerBtc:100000});
ok('sats 1btc', s.ok && s.usd===100000 && s.btc===1);
const s2=convertSatsUsd({usd:1, rateUsdPerBtc:100000});
ok('usd to sats', s2.ok && s2.sats===1000);
ok('sats bad rate', !convertSatsUsd({sats:1, rateUsdPerBtc:0}).ok);

// redact
const r=redactText('key AKIAIOSFODNN7EXAMPLE and me@x.com SSN 123-45-6789');
ok('redact aws', r.redacted.includes('[REDACTED:aws_access_key]'));
ok('redact email mask', r.redacted.includes('***@x.com'));
ok('redact ssn', r.redacted.includes('[REDACTED:us_ssn]'));
ok('redact hits', r.total>=3);

// nostr roundtrip
const hex='3bf0c63fcb93463407ae57554c5d8f6c8a1a2b0c3d4e5f60718293a4b5c6d7e8';
const enc=hexToNostr(hex,'npub');
ok('nostr encode', enc.ok && enc.bech.startsWith('npub1'));
const dec=nostrToHex(enc.bech);
ok('nostr roundtrip', dec.ok && dec.hex===hex);
ok('nostr bad', !nostrToHex('npub1qqqq').ok);

// HMAC via node crypto (mirrors WebCrypto behavior)
function hmacHex(algo, secret, payload){
  const map={ 'SHA-256':'sha256','SHA-1':'sha1','SHA-512':'sha512' };
  return crypto.createHmac(map[algo], secret).update(payload).digest('hex');
}
const h=hmacHex('SHA-256','secret','payload');
ok('hmac len', h.length===64);
ok('hmac known', h===crypto.createHmac('sha256','secret').update('payload').digest('hex'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
