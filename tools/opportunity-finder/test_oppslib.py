import os, sys, tempfile
sys.path.insert(0, "/workspace/earn/opps")
import oppslib as L

def test_score_paid_is_zero():
    it = L.make_item(title="Win a car — entry fee $20", url="https://example.com/a", summary="pay to enter now", type="contest", source="t", free_to_enter=False)
    assert it["score"] == 0

def test_score_bounty_high():
    it = L.make_item(title="Fix the parser bug", url="https://github.com/x/y/issues/1", summary="open bounty $500 USDC", type="bounty", source="github",
                     prize="$500", prize_usd=500, free_to_enter=True, us_ok=True, mi_ok=True, individual_ok=True, ein_required=False,
                     agent_doable=True, deadline="2026-11-20")
    assert it["score"] >= 70

def test_expired_zero():
    it = L.make_item(title="Old sweepstakes {US} (8/21/2025)", url="https://reddit.com/r/x/1", type="contest", source="reddit",
                     deadline="2025-08-21", published="2025-08-13", free_to_enter=True, us_ok=True)
    assert it["expired"] is True
    assert it["score"] == 0

def test_canon_and_fuzzy():
    a = L.make_item(title="Cosmo Hacks 2026", url="https://www.cosmohacks.devpost.com/?utm_source=x", type="hackathon", source="devpost", free_to_enter=True)
    b = L.make_item(title="Cosmo Hacks 2026!", url="https://cosmohacks.devpost.com", type="hackathon", source="devpost", free_to_enter=True)
    assert a["canon"] == b["canon"] or L.fuzzy_dup(a, b)

def test_deal_filter():
    it = L.make_item(title="YUM! Progresso Soups Only $5 on Amazon when you Buy 3!", url="https://thefreebieguy.com/x", type="contest", source="freebie-guy", drop_deals=True, need_opp_kw=True)
    assert it is None

def test_merge_dedupes():
    a = L.make_item(title="Open bounty", url="https://aibtc.com/bounty/abc", type="bounty", source="aibtc", free_to_enter=True, prize_sats=3000)
    rows, new, upd = L.merge([], [a, dict(a)], {})
    assert len(rows) == 1

if __name__ == "__main__":
    for n, fn in list(globals().items()):
        if n.startswith("test_") and callable(fn):
            fn(); print("ok", n)
    print("all ok")
