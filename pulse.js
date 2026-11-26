/* Bot Agora visitor pulse (t972u).
 * Tiny, disclosed helper that asks OUR OWN worker whether it has gone stale.
 * No mining, no tracking, no third-party hosts, no hidden work.
 * Server rate-limits /tick to once per 10 minutes and only runs the hourly job if last run is > 60 minutes old.
 * Opt out any time: the button sets localStorage["agora-pulse-optout"].
 */
(function () {
  var ENDPOINT = "https://agora-offbox-cron.sirgrokkius.workers.dev";
  var KEY = "agora-pulse-optout";
  function $(el, sel) { return el.querySelector(sel); }
  function optedOut() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function setOpt(v) { try { if (v) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch (e) {} }
  function fmt(iso) {
    if (!iso) return "never";
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return iso; }
  }
  function render(root, data, note) {
    var reason = data && data.reason;
    var line = "Worker last ran: " + fmt(data && data.last_run) + ".";
    if (data && data.leads_today != null) line += " Leads collected today: " + data.leads_today + ".";
    if (reason === "fresh") line += " It is fresh, so this visit did no extra work.";
    else if (reason === "rate_limited") line += " A tick was skipped (server rate limit, retry in " + (data.retry_after_min || "?") + " min).";
    else if (reason === "stale_started") line += " The worker was idle over an hour, so this visit started one hourly unit of work.";
    else if (reason === "opted_out") line += " Pulse is off in this browser.";
    else if (reason === "error") line += " Could not reach the worker from this browser.";
    var html = '<p class="agora-pulse-status" role="status">' + line + (note ? " " + note : "") + "</p>";
    if (data && data.items && data.items.length) {
      html += "<ul class=\"agora-pulse-leads\">";
      data.items.slice(0, 6).forEach(function (it) {
        var t = (it.title || "").replace(/[<>&]/g, function (c) { return ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]; });
        var href = (it.url || "").replace(/"/g, "");
        if (!/^https?:\/\//i.test(href)) return;
        html += '<li><a href="' + href + '" rel="noopener noreferrer">' + t + "</a></li>";
      });
      html += "</ul>";
    }
    var btn = optedOut() ? "Allow pulse in this browser" : "Don't ping from this browser";
    html += '<p class="agora-pulse-actions"><button type="button" class="agora-pulse-toggle">' + btn + "</button> · <a href=\"/pulse.html\">How this works</a> · <a href=\"https://agora-offbox-cron.sirgrokkius.workers.dev/public\">Public leads (CC BY 4.0)</a></p>";
    var slot = $(root, ".agora-pulse-live") || root.appendChild(Object.assign(document.createElement("div"), { className: "agora-pulse-live" }));
    slot.innerHTML = html;
    var b = $(slot, ".agora-pulse-toggle");
    if (b) b.addEventListener("click", function () {
      setOpt(!optedOut());
      mount(root);
    });
  }
  async function mount(root) {
    if (!root) return;
    if (optedOut()) {
      render(root, { last_run: null, reason: "opted_out", leads_today: null, items: [] }, "No request was sent.");
      return;
    }
    try {
      var tick = await fetch(ENDPOINT + "/tick", { cache: "no-store" }).then(function (r) { return r.json(); });
      var pub = await fetch(ENDPOINT + "/public", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; });
      tick.items = pub.items || [];
      render(root, tick);
    } catch (e) {
      render(root, { reason: "error", last_run: null, items: [] });
    }
  }
  function boot() {
    var el = document.getElementById("agora-pulse");
    if (el) mount(el);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.AgoraPulse = { mount: mount };
})();
