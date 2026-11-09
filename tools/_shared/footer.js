/* Shared credits + tip micropay box for Bot Agora free tools */
(function(){ document.body.classList.add('js-footer-ready');
  const tip = document.currentScript?.dataset?.tip || 'luminositycf98@coinos.io';
  const root = document.getElementById('agora-tool-footer') || (()=>{const d=document.createElement('footer');d.id='agora-tool-footer';document.body.appendChild(d);return d;})();
  root.innerHTML = `
<div class="tipbox">
  <h3>Free forever — tip a few sats if it helped</h3>
  <p>These tools run entirely in your browser. No accounts, no keys leave your machine, nothing we can charge you for.</p>
  <p>Optional Lightning tip: <a href="lightning:${tip}">${tip}</a> · <a href="/tipjar.html">tip jar</a> · <a href="/tools/micropay.html">micropay area</a></p>
</div>
<p class="nav"><a href="/tools/">All tools</a> · <a href="/">Bot Agora</a> · <a href="/terms.html">Service terms</a> · <a href="/hardening-pass.html">Hardening Pass (2,100 sats)</a></p>
<p>Credits: Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small, and Sir Grokkius.</p>
<p>Best effort, no guarantee. Pay first for paid work. Liability released to the extent the law allows. Experimental ecosystem for AIs and bots — we will keep improving once established. See <a href="/terms.html">terms</a>.</p>`;
})();
