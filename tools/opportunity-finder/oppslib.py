#!/usr/bin/env python3
"""oppslib — shared Opportunity Finder core (stdlib only).

Sir Grokkius for Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small.
MIT. Used by ua-opps-rss, ua-opps-search, and ua-opps-publish.
"""
from __future__ import annotations
import datetime as dt, hashlib, html, json, os, re, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

ETZ = ZoneInfo("America/New_York")
DIR = os.environ.get("UA_OPPS_DIR", "/workspace/earn/opps")
JSONL = os.path.join(DIR, "opps.jsonl")
SEEN = os.path.join(DIR, "seen.json")
HEALTH = os.path.join(DIR, "health.json")
TODAY = os.path.join(DIR, "OPPS-TODAY.md")
SUMMARY = os.path.join(DIR, "summary.json")
PUBLIC = os.environ.get("UA_OPPS_PUBLIC", "/workspace/earn/agora/opps")
SITE = "https://bot-agora.surge.sh/opps/"
CREDIT = "Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small, with Sir Grokkius"
UA = "ua-opps/1.0 (Sir Grokkius Opportunity Finder; read-only; +https://bot-agora.surge.sh/opps/)"
UA_REDDIT = "Mozilla/5.0 (compatible; ua-opps/1.0; +https://bot-agora.surge.sh/opps/)"
ATOM = "{http://www.w3.org/2005/Atom}"
TYPES = ("contest", "grant", "bounty", "hackathon", "writing")

PAID_RE = re.compile(
    r"\b(entry fee|reading fee|submission fee|pay to enter|purchase required|buy to enter|"
    r"paid entr(y|ies)|entry pack|pay to claim|processing fee|shipping and handling|"
    r"wire transfer to claim|claim fee|no purchase necessary except|admin fee)\b",
    re.I,
)
NOPURCHASE_RE = re.compile(r"\bno purchase necessary\b|\bAMOE\b|\bfree (to )?enter\b", re.I)
DEAL_RE = re.compile(r"\b(coupon|promo code|only \$\d|sale ends|\% off|discount code)\b", re.I)
OPP_RE = re.compile(
    r"\b(sweepstakes|giveaway?|contest|hackathon|bounty|grant|fellowship|scholarship|"
    r"call for (entries|submissions)|prize|award|no purchase necessary|AMOE|RFP)\b",
    re.I,
)
# HN "bounty" often matches "county"
FALSE_RE = re.compile(r"\b(county|counties|contested election|bounty hunter movie)\b", re.I)
DEADLINE_IN_TITLE = re.compile(
    r"\((?:deadline:?\s*)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\)"
    r"|(?:deadline|due|ends?|closes?|until)\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})",
    re.I,
)
MONEY_RE = re.compile(
    r"\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k|thousand|million|m)?|\b([\d,]+)\s*(sats?)\b|"
    r"\b([\d,]+)\s*(USDC|USD|USDT)\b",
    re.I,
)
TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref", "ref_src", "mc_cid", "mc_eid"}

# Verified 2026-11-12 from this box (status 200 + parseable items). Health log drops dead ones later.
RSS_SOURCES = [
    {"id": "aibtc", "type": "bounty", "kind": "aibtc", "url": "https://aibtc.com/api/bounties?status=open&limit=100", "ua": UA},
    {"id": "devpost-upcoming", "type": "hackathon", "kind": "devpost", "url": "https://devpost.com/api/hackathons?status=upcoming&per_page=50", "ua": UA},
    {"id": "devpost-open", "type": "hackathon", "kind": "devpost", "url": "https://devpost.com/api/hackathons?status=open&per_page=50", "ua": UA},
    {"id": "superteam", "type": "bounty", "kind": "superteam", "url": "https://earn.superteam.fun/api/listings", "ua": UA},
    {"id": "online-sweepstakes", "type": "contest", "kind": "rss", "url": "https://www.online-sweepstakes.com/feed/", "ua": UA, "need_opp_kw": True},
    {"id": "freebie-guy", "type": "contest", "kind": "rss", "url": "https://thefreebieguy.com/feed/", "ua": UA, "need_opp_kw": True, "drop_deals": True},
    {"id": "fundsforwriters", "type": "writing", "kind": "rss", "url": "https://www.fundsforwriters.com/feed/", "ua": UA, "need_opp_kw": True},
    {"id": "authorspublish", "type": "writing", "kind": "rss", "url": "https://www.authorspublish.com/feed/", "ua": UA, "need_opp_kw": True},
    {"id": "hnrss-bounty", "type": "bounty", "kind": "rss", "url": "https://hnrss.org/newest?q=%22bounty%22", "ua": UA, "need_opp_kw": True, "optional": True},
    {"id": "hnrss-hackathon", "type": "hackathon", "kind": "rss", "url": "https://hnrss.org/newest?q=hackathon", "ua": UA, "need_opp_kw": True, "optional": True},
    {"id": "sn-bounties", "type": "bounty", "kind": "rss", "url": "https://stacker.news/~bounties/rss", "ua": UA, "optional": True},
]

SEARCH_SOURCES = [
    {"id": "github-bounty", "type": "bounty", "kind": "github",
     "url": "https://api.github.com/search/issues?q=label:bounty+state:open&per_page=30&sort=updated", "ua": UA},
    {"id": "hn-algolia-bounty", "type": "bounty", "kind": "hn",
     "url": "https://hn.algolia.com/api/v1/search_by_date?query=%22bounty%22&tags=story&hitsPerPage=30", "ua": UA, "need_opp_kw": True},
    {"id": "hn-algolia-hackathon", "type": "hackathon", "kind": "hn",
     "url": "https://hn.algolia.com/api/v1/search_by_date?query=hackathon&tags=story&hitsPerPage=20", "ua": UA, "need_opp_kw": True},
    {"id": "hn-algolia-sweepstakes", "type": "contest", "kind": "hn",
     "url": "https://hn.algolia.com/api/v1/search_by_date?query=sweepstakes&tags=story&hitsPerPage=15", "ua": UA, "need_opp_kw": True},
    {"id": "reddit-sweepstakes", "type": "contest", "kind": "rss",
     "url": "https://www.reddit.com/r/sweepstakes/new/.rss?limit=40", "ua": UA_REDDIT},
    {"id": "reddit-contests", "type": "contest", "kind": "rss",
     "url": "https://www.reddit.com/r/contests/new/.rss?limit=40", "ua": UA_REDDIT},
    {"id": "reddit-grants", "type": "grant", "kind": "rss",
     "url": "https://www.reddit.com/r/grants/new/.rss?limit=25", "ua": UA_REDDIT, "need_opp_kw": True},
    {"id": "grantsgov-individuals", "type": "grant", "kind": "grantsgov",
     "url": "https://api.grants.gov/v1/api/search2", "ua": UA},
]


def now() -> dt.datetime:
    return dt.datetime.now(ETZ)


def today() -> dt.date:
    return now().date()


def iso_now() -> str:
    return now().strftime("%Y-%m-%d %H:%M ET")


def ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)


def atomic_write(path: str, text: str) -> None:
    ensure_dir(path)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def load_json(path: str, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def load_jsonl(path: str) -> list[dict]:
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except Exception:
                        continue
    except FileNotFoundError:
        pass
    return rows


# ---------- HTTP ----------
def fetch(url: str, ua: str = UA, method: str = "GET", data: bytes | None = None,
          headers: dict | None = None, timeout: int = 20, retries: int = 3, max_bytes: int = 2_000_000):
    """Return (status, body_bytes, content_type, final_url, error_str). Retries 429/5xx/URL errors."""
    h = {"User-Agent": ua, "Accept": "application/rss+xml, application/atom+xml, application/json, application/xml, text/xml, */*", "Accept-Encoding": "identity"}
    if headers:
        h.update(headers)
    last_err = ""
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=h, method=method)
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                chunks, n = [], 0
                while True:
                    b = r.read(65536)
                    if not b:
                        break
                    n += len(b)
                    if n <= max_bytes:
                        chunks.append(b)
                body = b"".join(chunks)
                return r.status, body, r.headers.get("Content-Type", ""), r.geturl(), None, int((time.time() - t0) * 1000)
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            body = b""
            try:
                body = e.read(max_bytes)
            except Exception:
                pass
            ms = int((time.time() - t0) * 1000)
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            return e.code, body, (e.headers.get("Content-Type", "") if e.headers else ""), url, last_err, ms
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            return 0, b"", "", url, last_err, int((time.time() - t0) * 1000)
    return 0, b"", "", url, last_err, 0


def link_status(url: str, timeout: int = 12) -> int:
    """HEAD, then GET if HEAD is 405/403/0. Returns HTTP status or 0."""
    for method in ("HEAD", "GET"):
        status, _b, _ct, _u, err, _ms = fetch(url, method=method, timeout=timeout, retries=1, max_bytes=2048)
        if status:
            return status
        if method == "HEAD" and (not status or status in (403, 405)):
            continue
        if err:
            return status
    return 0


# ---------- normalize / parse ----------
def canon_url(url: str) -> str:
    if not url:
        return ""
    url = html.unescape(url).strip()
    try:
        p = urllib.parse.urlsplit(url)
    except Exception:
        return url
    scheme = (p.scheme or "https").lower()
    host = (p.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if k.lower() not in TRACKING]
    query = urllib.parse.urlencode(q)
    path = p.path or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    netloc = host
    if p.port and p.port not in (80, 443):
        netloc = f"{host}:{p.port}"
    return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))


def norm_title(title: str) -> str:
    t = html.unescape(title or "").lower()
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def parse_date(s: str | None) -> dt.date | None:
    if not s:
        return None
    s = html.unescape(str(s)).strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    for cand in (s, s[:10], s[:19]):
        try:
            d = dt.datetime.fromisoformat(cand)
            if d.tzinfo:
                d = d.astimezone(ETZ)
            return d.date()
        except Exception:
            pass
    try:
        d = parsedate_to_datetime(s)
        if d.tzinfo:
            d = d.astimezone(ETZ)
        return d.date()
    except Exception:
        pass
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", s)
    if m:
        a, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if c < 100:
            c += 2000
        # prefer M/D/Y (US aggregators)
        try:
            return dt.date(c, a, b)
        except Exception:
            try:
                return dt.date(c, b, a)
            except Exception:
                return None
    m = re.search(r"([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})", s)
    if m:
        try:
            return dt.datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y").date()
        except Exception:
            try:
                return dt.datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%b %d %Y").date()
            except Exception:
                return None
    return None


def deadline_from_text(*parts: str) -> dt.date | None:
    text = " ".join(p for p in parts if p)
    m = DEADLINE_IN_TITLE.search(text)
    if m:
        return parse_date(next(g for g in m.groups() if g))
    return parse_date(text) if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", text.strip()) else None


def parse_prize(text: str) -> tuple[str, float | None, int | None]:
    """Return (label, usd_or_none, sats_or_none)."""
    if not text:
        return "", None, None
    t = html.unescape(re.sub(r"<[^>]+>", " ", text))
    m = MONEY_RE.search(t)
    if not m:
        return t.strip()[:80], None, None
    if m.group(1) is not None:
        n = float(m.group(1).replace(",", ""))
        suf = (m.group(2) or "").lower()
        if suf in ("k", "thousand"):
            n *= 1000
        elif suf in ("m", "million"):
            n *= 1_000_000
        label = f"${int(n) if n >= 10 else n:,.0f}" if n >= 10 else f"${n}"
        return label, n, None
    if m.group(3) is not None:
        sats = int(m.group(3).replace(",", ""))
        return f"{sats} sats", None, sats
    if m.group(5) is not None:
        n = float(m.group(5).replace(",", ""))
        unit = m.group(6).upper()
        label = f"{int(n) if n >= 1 else n} {unit}"
        usd = n if unit in ("USD", "USDC", "USDT") else None
        return label, usd, None
    return t.strip()[:80], None, None


def strip_html(s: str) -> str:
    s = html.unescape(s or "")
    s = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def item_id(url: str, title: str) -> str:
    return hashlib.sha1(f"{canon_url(url)}|{norm_title(title)}".encode()).hexdigest()[:12]


def make_item(**kw) -> dict | None:
    title = strip_html(kw.get("title") or "")
    url = (kw.get("url") or "").strip()
    if not title or not url or not url.startswith("http"):
        return None
    summary = strip_html(kw.get("summary") or "")[:600]
    typ = kw.get("type") or "contest"
    if typ not in TYPES:
        typ = "contest"
    blob = f"{title} {summary}"
    if kw.get("need_opp_kw") and not OPP_RE.search(blob):
        return None
    if kw.get("drop_deals") and DEAL_RE.search(blob) and not re.search(r"\b(sweepstakes|giveaway|contest)\b", blob, re.I):
        return None
    if FALSE_RE.search(title) and typ == "bounty" and not re.search(r"\bbounty\b", title, re.I):
        return None
    paid = bool(PAID_RE.search(blob))
    free = kw.get("free_to_enter")
    if free is None:
        if paid:
            free = False
        elif NOPURCHASE_RE.search(blob) or typ in ("bounty", "hackathon"):
            free = True
        else:
            free = None  # unknown — still list, scoring will be cautious
    deadline = kw.get("deadline")
    if isinstance(deadline, str):
        deadline = parse_date(deadline)
    if deadline is None:
        deadline = deadline_from_text(title, summary, kw.get("deadline_text") or "")
    published = kw.get("published")
    if isinstance(published, str):
        published = parse_date(published)
    prize_label = kw.get("prize") or ""
    prize_usd = kw.get("prize_usd")
    prize_sats = kw.get("prize_sats")
    if not prize_label:
        prize_label, pu, ps = parse_prize(blob)
        prize_usd = prize_usd if prize_usd is not None else pu
        prize_sats = prize_sats if prize_sats is not None else ps
    if prize_usd is not None and prize_usd <= 0:
        prize_usd = None
        if prize_label in ("$0", "$0.0", "$0.00"):
            prize_label = ""
    ein = bool(kw.get("ein_required"))
    individual = kw.get("individual_ok")
    if individual is None:
        individual = not ein
    us_ok = kw.get("us_ok")
    mi_ok = kw.get("mi_ok")
    if us_ok is True and mi_ok is None:
        mi_ok = True  # federal/US-wide: MI is in the US unless a source says otherwise
    # geo hints
    geo = blob + " " + (kw.get("geo_text") or "")
    if re.search(r"\b(US only|United States only|U\.S\. only|{US})\b", geo, re.I):
        us_ok, mi_ok = True, True
    if re.search(r"\b(no Michigan|except Michigan|MI (residents )?excluded)\b", geo, re.I):
        mi_ok = False
    if re.search(r"\b(UK only|Canada only|{UK}|{CA}|EU only)\b", geo, re.I) and not re.search(r"\{US", geo):
        us_ok = False
        mi_ok = False
    agent = kw.get("agent_doable")
    if agent is None:
        agent = typ in ("bounty", "hackathon") and not paid
    it = {
        "id": item_id(url, title),
        "title": title[:300],
        "type": typ,
        "url": url,
        "canon": canon_url(url),
        "rules_url": (kw.get("rules_url") or "") or "",
        "source": kw.get("source") or "",
        "source_feed": kw.get("source_feed") or "",
        "summary": summary,
        "deadline": deadline.isoformat() if isinstance(deadline, dt.date) else None,
        "published": published.isoformat() if isinstance(published, dt.date) else None,
        "prize": prize_label[:80] if prize_label else "",
        "prize_usd": prize_usd,
        "prize_sats": prize_sats,
        "free_to_enter": free,
        "us_ok": us_ok,
        "mi_ok": mi_ok,
        "individual_ok": individual,
        "ein_required": ein,
        "agent_doable": bool(agent),
        "paid_or_scam_flag": paid,
        "first_seen": kw.get("first_seen") or iso_now(),
        "last_seen": iso_now(),
        "link_status": kw.get("link_status"),
        "expired": False,
        "score": 0,
    }
    it["expired"] = is_expired(it)
    it["score"] = score(it)
    return it


def is_expired(it: dict, on: dt.date | None = None) -> bool:
    on = on or today()
    d = parse_date(it.get("deadline")) if not isinstance(it.get("deadline"), dt.date) else it.get("deadline")
    if d and d < on:
        return True
    # very old listings with no deadline (e.g. stale reddit posts) — drop after 60 days
    p = parse_date(it.get("published")) if not isinstance(it.get("published"), dt.date) else it.get("published")
    if not d and p and (on - p).days > 60:
        return True
    return False


def score(it: dict) -> int:
    """Deterministic 0-100 fit score for an individual in Michigan, no EIN, free to enter, agent-doable."""
    if it.get("paid_or_scam_flag") or it.get("free_to_enter") is False:
        return 0
    if is_expired(it):
        return 0
    typ = it.get("type") or ""
    s = {"bounty": 40, "hackathon": 36, "contest": 32, "grant": 32, "writing": 30}.get(typ, 30)
    if it.get("free_to_enter") is True:
        s += 12
    elif it.get("free_to_enter") is None:
        s += 3
    if it.get("ein_required"):
        s -= 28
    if it.get("individual_ok") is True:
        s += 6
    elif it.get("individual_ok") is False:
        s -= 20
    if it.get("us_ok") is False:
        s -= 25
    elif it.get("us_ok") is True:
        s += 5
    if it.get("mi_ok") is False:
        s -= 20
    elif it.get("mi_ok") is True:
        s += 3
    if it.get("agent_doable"):
        s += 10
    d = parse_date(it.get("deadline"))
    if d:
        days = (d - today()).days
        if 0 <= days <= 14:
            s += 10
        elif days <= 30:
            s += 7
        elif days <= 90:
            s += 4
        elif days <= 180:
            s += 1
        elif days > 400:
            s -= 4  # rolling/open-ended federal FOAs often not practically doable
    usd = it.get("prize_usd")
    if usd is not None and usd <= 0:
        usd = None
    sats = it.get("prize_sats")
    if usd is not None:
        if usd >= 5000:
            s += 14
        elif usd >= 1000:
            s += 10
        elif usd >= 100:
            s += 6
        elif usd >= 25:
            s += 3
    elif sats is not None:
        if sats >= 20000:
            s += 10
        elif sats >= 5000:
            s += 7
        elif sats >= 1000:
            s += 5
        elif sats >= 100:
            s += 2
    prize = (it.get("prize") or "").lower()
    if re.search(r"\b(laptop|computer|desktop|workstation|32\s*gb|macbook)\b", prize):
        s += 8
    elif re.search(r"gift card", prize):
        s += 4
    return max(0, min(100, int(s)))


def fuzzy_dup(a: dict, b: dict) -> bool:
    if a.get("canon") and a.get("canon") == b.get("canon"):
        return True
    ta, tb = norm_title(a.get("title", "")), norm_title(b.get("title", ""))
    if not ta or not tb:
        return False
    if ta == tb:
        return True
    if abs(len(ta) - len(tb)) > 40:
        return False
    return SequenceMatcher(None, ta, tb).ratio() >= 0.92 and (not a.get("type") or not b.get("type") or a["type"] == b["type"])


# ---------- parsers ----------
def _rss_items_regex(text: str) -> list[tuple[str, str, str, str, str]]:
    """Fallback when XML is truncated/invalid. Returns (title, link, guid, date, desc)."""
    out = []
    for block in re.findall(r"<item\b[^>]*>(.*?)</item>|<entry\b[^>]*>(.*?)</entry>", text, re.I | re.S):
        chunk = block[0] or block[1]
        def tag(n):
            m = re.search(rf"<{n}[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))</{n}>", chunk, re.I | re.S)
            if not m:
                return ""
            return (m.group(1) or m.group(2) or "").strip()
        href = ""
        m = re.search(r'<link[^>]+href=["\']([^"\']+)', chunk, re.I)
        if m:
            href = m.group(1)
        title, link = tag("title"), tag("link") or href
        date = tag("pubDate") or tag("published") or tag("updated") or tag("dc:date")
        desc = tag("description") or tag("summary") or tag("content")
        guid = tag("guid") or tag("id") or link
        if title and link:
            out.append((title, link, guid, date, desc))
    return out


def parse_rss_atom(body: bytes, src: dict) -> list[dict]:
    text = body.decode("utf-8", "replace")
    rows = []
    try:
        root = ET.fromstring(body)
        channel_items = root.findall("./channel/item")
        entries = root.findall(f"{ATOM}entry") or root.findall("entry")
        if channel_items:
            for e in channel_items:
                title = (e.findtext("title") or "").strip()
                link = (e.findtext("link") or "").strip()
                if not link:
                    l = e.find("link")
                    if l is not None:
                        link = l.get("href") or (l.text or "")
                guid = (e.findtext("guid") or link).strip()
                date = e.findtext("pubDate") or e.findtext("{http://purl.org/dc/elements/1.1/}date") or ""
                desc = e.findtext("description") or e.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or ""
                rows.append((title, link, guid, date, desc))
        elif entries:
            for e in entries:
                title = (e.findtext(f"{ATOM}title") or e.findtext("title") or "").strip()
                link = ""
                for l in list(e.findall(f"{ATOM}link")) + list(e.findall("link")):
                    if l.get("rel") in (None, "alternate", "") and l.get("href"):
                        link = l.get("href")
                        break
                if not link:
                    link = (e.findtext(f"{ATOM}id") or e.findtext("id") or "")
                date = e.findtext(f"{ATOM}published") or e.findtext(f"{ATOM}updated") or e.findtext("published") or ""
                desc = e.findtext(f"{ATOM}summary") or e.findtext(f"{ATOM}content") or e.findtext("summary") or ""
                rows.append((title, link, link, date, desc))
    except ET.ParseError:
        rows = _rss_items_regex(text)
    items = []
    for title, link, _guid, date, desc in rows:
        it = make_item(
            title=title, url=link, summary=desc, type=src.get("type", "contest"),
            source=src["id"], source_feed=src["url"], published=date,
            need_opp_kw=src.get("need_opp_kw"), drop_deals=src.get("drop_deals"),
            us_ok=True if "reddit.com" in (src.get("url") or "") or "online-sweepstakes" in (src.get("url") or "") else None,
        )
        if it:
            items.append(it)
    return items


def parse_aibtc(data: dict, src: dict) -> list[dict]:
    out = []
    for b in data.get("bounties") or []:
        url = f"https://aibtc.com/bounty/{b.get('id')}"
        prize_sats = b.get("rewardSats")
        it = make_item(
            title=b.get("title") or "", url=url, summary=(b.get("description") or "")[:600],
            type="bounty", source=src["id"], source_feed=src["url"],
            deadline=b.get("expiresAt"), published=b.get("createdAt") or b.get("opensAt"),
            prize=f"{prize_sats} sats" if prize_sats is not None else "",
            prize_sats=int(prize_sats) if prize_sats is not None else None,
            free_to_enter=True, us_ok=True, mi_ok=True, individual_ok=True, ein_required=False,
            agent_doable=True, rules_url=url,
        )
        if it:
            out.append(it)
    return out


def parse_devpost(data: dict, src: dict) -> list[dict]:
    out = []
    for h in data.get("hackathons") or []:
        url = h.get("url") or ""
        loc = (h.get("displayed_location") or {}).get("location") or ""
        prize_html = h.get("prize_amount") or ""
        _label, usd, _s = parse_prize((prize_html or "") + " " + (h.get("title") or ""))
        if usd is not None and usd <= 0:
            usd = None
        if not _label or _label in ("$0", "$0.0", "$0.00"):
            _label, usd2, _s2 = parse_prize(h.get("title") or "")
            usd = usd or usd2
            _s = _s or _s2
        dates = h.get("submission_period_dates") or ""
        # "Dec 19, 2026 - Jan 18, 2027" → end date
        end = None
        if " - " in dates:
            end = parse_date(dates.split(" - ", 1)[1])
        online = bool(re.search(r"online", loc, re.I))
        it = make_item(
            title=h.get("title") or "", url=url,
            summary=f"{loc}. Submissions: {dates}. Themes: " + ", ".join(t.get("name", "") for t in (h.get("themes") or [])) ,
            type="hackathon", source=src["id"], source_feed=src["url"],
            deadline=end, prize=_label, prize_usd=usd,
            free_to_enter=not h.get("invite_only"), us_ok=True if online else None, mi_ok=True if online else None,
            individual_ok=True, ein_required=False, agent_doable=online or True,
            rules_url=url, geo_text=loc,
        )
        if it:
            out.append(it)
    return out


def parse_superteam(data, src: dict) -> list[dict]:
    rows = data if isinstance(data, list) else (data.get("listings") or data.get("data") or [])
    out = []
    for b in rows:
        typ = (b.get("type") or "bounty").lower()
        if typ not in TYPES:
            typ = "hackathon" if typ in ("hackathon", "project") else "bounty"
        slug = b.get("slug") or b.get("id")
        url = f"https://earn.superteam.fun/listings/{slug}" if slug else ""
        amt, token = b.get("rewardAmount"), (b.get("token") or "").upper()
        prize, usd, sats = "", None, None
        if amt is not None:
            prize = f"{int(amt) if float(amt) >= 1 else amt} {token or 'USD'}".strip()
            if token in ("USD", "USDC", "USDT"):
                usd = float(amt)
        human_only = str(b.get("agentAccess") or "").upper() == "HUMAN_ONLY"
        socialish = bool(re.search(r"\b(twitter|tiktok|youtube|video|animation|instagram|thread)\b", (b.get("title") or ""), re.I))
        it = make_item(
            title=b.get("title") or "", url=url, summary=f"Superteam {typ}. Sponsor: {(b.get('sponsor') or {}).get('name','')}. Status: {b.get('status')}",
            type=typ, source=src["id"], source_feed=src["url"], deadline=b.get("deadline"),
            prize=prize, prize_usd=usd, prize_sats=sats,
            free_to_enter=True, individual_ok=True, ein_required=False,
            agent_doable=not human_only and not socialish and typ in ("bounty", "hackathon"),
            us_ok=None, rules_url=url,
        )
        if it:
            if human_only:
                it["summary"] = (it["summary"] + " Listing flags agentAccess=HUMAN_ONLY.").strip()
            out.append(it)
    return out


def parse_github(data: dict, src: dict) -> list[dict]:
    out = []
    for i in data.get("items") or []:
        title = i.get("title") or ""
        url = i.get("html_url") or ""
        body = (i.get("body") or "")[:600]
        labels = [str((l.get("name") if isinstance(l, dict) else l) or "") for l in (i.get("labels") or [])]
        prize, usd, sats = parse_prize(title + " " + body + " " + " ".join(labels))
        it = make_item(
            title=title, url=url, summary=body or ("Labels: " + ", ".join(labels)),
            type="bounty", source=src["id"], source_feed=src["url"],
            published=i.get("created_at"), deadline=i.get("closed_at") and None,
            prize=prize, prize_usd=usd, prize_sats=sats,
            free_to_enter=True, individual_ok=True, ein_required=False, agent_doable=True,
            rules_url=url, need_opp_kw=False,
        )
        if it:
            out.append(it)
    return out


def parse_hn(data: dict, src: dict) -> list[dict]:
    out = []
    typ = src.get("type", "bounty")
    for h in data.get("hits") or []:
        title = h.get("title") or h.get("story_title") or ""
        url = h.get("url") or (f"https://news.ycombinator.com/item?id={h.get('objectID')}" if h.get("objectID") else "")
        if not OPP_RE.search(title or "") and typ == "bounty" and not re.search(r"\bbounty\b", title or "", re.I):
            continue
        it = make_item(
            title=title, url=url, summary=f"HN by {h.get('author')}, {h.get('points')} points",
            type=typ, source=src["id"], source_feed=src["url"],
            published=h.get("created_at"), need_opp_kw=True,
            rules_url=url, free_to_enter=True if typ in ("bounty", "hackathon") else None,
        )
        if it:
            out.append(it)
    return out


def parse_grantsgov(data: dict, src: dict) -> list[dict]:
    payload = data.get("data") or data
    out = []
    for g in payload.get("oppHits") or []:
        gid = g.get("id")
        url = f"https://www.grants.gov/search-results-detail/{gid}" if gid else ""
        title = html.unescape(g.get("title") or "")
        close = g.get("closeDate")
        # closeDate comes as MM/DD/YYYY
        it = make_item(
            title=title, url=url,
            summary=f"{g.get('agency') or ''} · {g.get('number') or ''} · status {g.get('oppStatus') or ''}. Eligibility filtered to Individuals (code 21). Many still need SAM.gov/UEI; this is not a promise of a simple application.",
            type="grant", source=src["id"], source_feed=src["url"],
            deadline=parse_date(close), published=parse_date(g.get("openDate")),
            free_to_enter=True, individual_ok=True, ein_required=False,  # no EIN required in the filter; UEI may still apply
            us_ok=True, mi_ok=True, agent_doable=False,
            rules_url=url,
        )
        if it:
            out.append(it)
    return out


def parse_source(src: dict, status: int, body: bytes, ct: str) -> list[dict]:
    kind = src.get("kind")
    if status != 200 or not body:
        return []
    if kind in ("rss",) or (body.lstrip().startswith(b"<?xml") or body.lstrip().startswith(b"<rss") or body.lstrip().startswith(b"<feed")):
        return parse_rss_atom(body, src)
    try:
        data = json.loads(body.decode("utf-8", "replace"))
    except Exception:
        return parse_rss_atom(body, src)
    if kind == "aibtc":
        return parse_aibtc(data, src)
    if kind == "devpost":
        return parse_devpost(data, src)
    if kind == "superteam":
        return parse_superteam(data, src)
    if kind == "github":
        return parse_github(data, src)
    if kind == "hn":
        return parse_hn(data, src)
    if kind == "grantsgov":
        return parse_grantsgov(data, src)
    return []


def fetch_source(src: dict) -> tuple[list[dict], dict]:
    kwargs = {"ua": src.get("ua") or UA, "timeout": 25, "retries": 3}
    if src.get("kind") == "grantsgov":
        payload = {"oppStatuses": "posted", "rows": 25, "eligibilities": "21"}
        status, body, ct, final, err, ms = fetch(
            src["url"], method="POST", data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}, **kwargs,
        )
    else:
        status, body, ct, final, err, ms = fetch(src["url"], **kwargs)
    items = []
    if status == 200:
        items = parse_source(src, status, body, ct)
    health = {
        "id": src["id"], "url": src["url"], "status": status, "ms": ms,
        "items": len(items), "error": err, "at": iso_now(), "bytes": len(body or b""),
        "ok": status == 200 and (len(items) > 0 or src.get("optional")),
    }
    return items, health


# ---------- store ----------
def merge(existing: list[dict], incoming: list[dict], seen: dict) -> tuple[list[dict], int, int]:
    by_canon = {it.get("canon") or canon_url(it.get("url", "")): it for it in existing if it.get("url")}
    new_n = upd_n = 0
    for it in incoming:
        c = it.get("canon") or canon_url(it["url"])
        it["canon"] = c
        hit = by_canon.get(c)
        if not hit:
            for other in by_canon.values():
                if fuzzy_dup(it, other):
                    hit = other
                    break
        if hit:
            # keep first_seen, refresh last_seen and volatile fields if richer
            it["first_seen"] = hit.get("first_seen") or it.get("first_seen")
            it["id"] = hit.get("id") or it["id"]
            if not it.get("rules_url") and hit.get("rules_url"):
                it["rules_url"] = hit["rules_url"]
            if not it.get("prize") and hit.get("prize"):
                it["prize"] = hit["prize"]
                it["prize_usd"] = hit.get("prize_usd")
                it["prize_sats"] = hit.get("prize_sats")
            if it.get("link_status") is None:
                it["link_status"] = hit.get("link_status")
            it["expired"] = is_expired(it)
            it["score"] = score(it)
            by_canon[hit.get("canon") or c] = it
            if hit.get("canon") != c:
                by_canon[c] = it
            upd_n += 1
        else:
            it["expired"] = is_expired(it)
            it["score"] = score(it)
            by_canon[c] = it
            new_n += 1
        seen.setdefault(c, {"first_seen": it.get("first_seen"), "id": it["id"]})
        seen[c]["last_seen"] = it.get("last_seen")
    rows = list(by_canon.values())
    rows.sort(key=lambda x: (-int(x.get("score") or 0), x.get("deadline") or "9999", x.get("title") or ""))
    return rows, new_n, upd_n


def save_store(rows: list[dict], seen: dict) -> None:
    ensure_dir(JSONL)
    atomic_write(JSONL, "".join(json.dumps(r, ensure_ascii=False, default=str) + "\n" for r in rows))
    atomic_write(SEEN, json.dumps(seen, indent=1, ensure_ascii=False))


def save_health(entries: list[dict], kind: str) -> None:
    h = load_json(HEALTH, {"sources": {}})
    h["updated"] = iso_now()
    for e in entries:
        prev = h.get("sources", {}).get(e["id"], {})
        streak = 0 if e.get("ok") else int(prev.get("fail_streak") or 0) + 1
        e["fail_streak"] = streak
        h.setdefault("sources", {})[e["id"]] = e
    atomic_write(HEALTH, json.dumps(h, indent=1, ensure_ascii=False))


def active_items(rows: list[dict]) -> list[dict]:
    out = []
    for it in rows:
        if it.get("paid_or_scam_flag") or it.get("free_to_enter") is False:
            continue
        if it.get("link_status") in (404, 410):
            continue
        if is_expired(it):
            continue
        if (it.get("score") or 0) <= 0:
            continue
        out.append(it)
    return out


def write_today(rows: list[dict]) -> list[dict]:
    active = active_items(rows)
    active = sorted(active, key=lambda x: (-int(x.get("score") or 0), x.get("deadline") or "9999"))
    lines = [
        f"# Opportunities today — {today().isoformat()} (America/New_York)",
        "",
        f"Built by `ua-opps-rss` / `ua-opps-search`. Score is a local fit ranking (free to enter, US/Michigan, individual / no EIN, agent-doable, deadline, prize). Always read the official rules. Experimental, best effort, not advice.",
        "",
        f"Active (not expired, not paid-entry, not 404): **{len(active)}**. Store: `{JSONL}` ({len(rows)} unique URLs).",
        "",
        f"Public index: {SITE}",
        "",
        "| Score | Type | Deadline | Prize | Title | Source |",
        "|---:|---|---|---|---|---|",
    ]
    for it in active[:80]:
        title = it["title"].replace("|", "/")
        link = it.get("url") or ""
        rules = it.get("rules_url") or ""
        tcell = f"[{title}]({link})" + (f" · [rules]({rules})" if rules and rules != link else "")
        lines.append(
            f"| {it.get('score')} | {it.get('type')} | {it.get('deadline') or '—'} | {it.get('prize') or '—'} | {tcell} | {it.get('source')} |"
        )
    lines += ["", f"Credit: {CREDIT}.", ""]
    atomic_write(TODAY, "\n".join(lines))
    summary = {
        "generated": iso_now(),
        "n_active": len(active),
        "n_store": len(rows),
        "path": TODAY,
        "page": SITE,
        "top": [{"title": it["title"], "type": it["type"], "score": it.get("score"), "deadline": it.get("deadline"), "url": it.get("url"), "prize": it.get("prize")} for it in active[:8]],
    }
    atomic_write(SUMMARY, json.dumps(summary, indent=1, ensure_ascii=False))
    return active


def _rss_escape(s: str) -> str:
    return html.escape(s or "", quote=True)


def public_payload(active: list[dict]) -> dict:
    slim = []
    for it in active:
        slim.append({k: it.get(k) for k in (
            "id", "title", "type", "url", "rules_url", "source", "summary", "deadline",
            "published", "prize", "prize_usd", "prize_sats", "score", "free_to_enter",
            "us_ok", "mi_ok", "individual_ok", "ein_required", "agent_doable",
        )})
    return {
        "generated_at": iso_now(),
        "timezone": "America/New_York",
        "page": SITE,
        "credit": CREDIT,
        "note": "Experimental public index of no-purchase contests, individual grants, coding bounties, prize hackathons, and writing contests. Best effort, not advice; always read the official rules. MIT.",
        "count": len(slim),
        "items": slim,
    }


def build_rss(active: list[dict], title: str, page: str, typ: str | None = None) -> str:
    items = [it for it in active if typ is None or it.get("type") == typ]
    buf = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        f"<title>{_rss_escape(title)}</title>",
        f"<link>{_rss_escape(page)}</link>",
        f"<description>{_rss_escape('Bot Agora Opportunity Finder. ' + CREDIT + '. Experimental, best effort, not advice.')}</description>",
        f"<lastBuildDate>{now().astimezone(dt.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')}</lastBuildDate>",
        f'<atom:link href="{_rss_escape(page)}" rel="self" type="application/rss+xml"/>',
        "<language>en-us</language>",
    ]
    for it in items[:150]:
        buf += [
            "<item>",
            f"<title>{_rss_escape(it.get('title'))}</title>",
            f"<link>{_rss_escape(it.get('url'))}</link>",
            f"<guid isPermaLink=\"false\">{_rss_escape(it.get('id') or it.get('url'))}</guid>",
            f"<category>{_rss_escape(it.get('type'))}</category>",
            f"<description>{_rss_escape((it.get('summary') or '') + ' Score ' + str(it.get('score')) + ('. Prize: ' + it['prize'] if it.get('prize') else '') + ('. Deadline: ' + it['deadline'] if it.get('deadline') else ''))}</description>",
        ]
        if it.get("deadline"):
            # pubDate = deadline if we have no published? use last_seen-ish: published or now
            pass
        pub = parse_date(it.get("published")) or today()
        buf.append(f"<pubDate>{dt.datetime(pub.year, pub.month, pub.day, tzinfo=ETZ).astimezone(dt.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>")
        buf.append("</item>")
    buf += ["</channel>", "</rss>", ""]
    return "\n".join(buf)


def build_atom(active: list[dict], title: str, page: str) -> str:
    updated = now().astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    buf = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        f"<title>{_rss_escape(title)}</title>",
        f'<link rel="alternate" href="{_rss_escape(SITE)}"/>',
        f'<link rel="self" href="{_rss_escape(page)}"/>',
        f"<id>{_rss_escape(SITE)}</id>",
        f"<updated>{updated}</updated>",
        f"<author><name>{_rss_escape(CREDIT)}</name></author>",
        "<subtitle>Experimental public opportunity index. Best effort, not advice.</subtitle>",
    ]
    for it in active[:150]:
        buf += [
            "<entry>",
            f"<title>{_rss_escape(it.get('title'))}</title>",
            f'<link href="{_rss_escape(it.get("url"))}"/>',
            f"<id>urn:bot-agora-opps:{_rss_escape(it.get('id'))}</id>",
            f"<updated>{updated}</updated>",
            f"<category term=\"{_rss_escape(it.get('type'))}\"/>",
            f"<summary>{_rss_escape(it.get('summary') or it.get('title'))}</summary>",
            "</entry>",
        ]
    buf += ["</feed>", ""]
    return "\n".join(buf)


def write_public(active: list[dict], page_html: str | None = None) -> None:
    os.makedirs(PUBLIC, exist_ok=True)
    payload = public_payload(active)
    atomic_write(os.path.join(PUBLIC, "opps.json"), json.dumps(payload, indent=1, ensure_ascii=False))
    atomic_write(os.path.join(PUBLIC, "opps.rss"), build_rss(active, "Bot Agora Opportunity Finder", SITE + "opps.rss"))
    atomic_write(os.path.join(PUBLIC, "opps.atom"), build_atom(active, "Bot Agora Opportunity Finder", SITE + "opps.atom"))
    names = {"contest": "contests.rss", "grant": "grants.rss", "bounty": "bounties.rss", "hackathon": "hackathons.rss", "writing": "writing.rss"}
    for typ, label in (("contest", "Contests"), ("grant", "Grants"), ("bounty", "Bounties"), ("hackathon", "Hackathons"), ("writing", "Writing contests")):
        name = names[typ]
        atomic_write(os.path.join(PUBLIC, name), build_rss(active, f"Bot Agora Opportunity Finder — {label}", SITE + name, typ))
    if page_html:
        atomic_write(os.path.join(PUBLIC, "index.html"), page_html)


def check_new_links(rows: list[dict], limit: int = 40) -> int:
    """Check items missing link_status, drop 404/410. Returns how many were checked."""
    n = 0
    for it in rows:
        if it.get("link_status"):
            continue
        if is_expired(it) or it.get("paid_or_scam_flag"):
            continue
        it["link_status"] = link_status(it["url"])
        n += 1
        if n >= limit:
            break
        time.sleep(0.15)
    return n


def harvest(sources: list[dict], label: str) -> tuple[list[dict], list[dict]]:
    existing = load_jsonl(JSONL)
    seen = load_json(SEEN, {})
    incoming, healths = [], []
    for src in sources:
        items, health = fetch_source(src)
        healths.append(health)
        incoming.extend(items)
        print(f"{'OK' if health.get('ok') else 'FAIL'} {src['id']:24} status={health['status']} {health['ms']}ms items={health['items']} {health.get('error') or ''}", flush=True)
        time.sleep(0.2)
    rows, new_n, upd_n = merge(existing, incoming, seen)
    save_store(rows, seen)
    save_health(healths, label)
    active = write_today(rows)
    print(f"{label}: fetched {len(incoming)} parsed, {new_n} new, {upd_n} updated, store {len(rows)}, active {len(active)}")
    return rows, active
