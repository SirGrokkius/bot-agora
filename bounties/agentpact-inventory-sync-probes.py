import copy, json, os, tempfile, gc, warnings
warnings.simplefilter("always", ResourceWarning)
import inventory_sync as m

# P1: mutates caller's dict in place
local = {"A": {"qty": 5, "price": 100.0}}
orig = copy.deepcopy(local)
out = m.reconcile(local, {"A": {"qty": 3, "price": 100.0}}, 10)
print("P1 same object returned:", out is local, "| caller dict changed:", local != orig, local)

# P2: qty is ADDED, not synced: running the same feed twice doubles stock
local = {"A": {"qty": 5, "price": 100.0}}
feed = {"A": {"qty": 3, "price": 100.0}}
m.reconcile(local, feed, 0); m.reconcile(local, feed, 0)
print("P2 qty after 2 syncs of feed qty=3 (local 5):", local["A"]["qty"])

# P3: discount applied to feed price each run; and compounding when local price reused? check repeat with discount
local = {"A": {"qty": 1, "price": 100.0}}
m.reconcile(local, {"A": {"qty": 0, "price": 100.0}}, 10)
print("P3 price after 10% on 100:", local["A"]["price"])

# P4: no validation of discount_pct
for d in (150, -50, "10"):
    try:
        l = {}; m.reconcile(l, {"A": {"qty": 1, "price": 100.0}}, d); print("P4 discount", repr(d), "-> price", l["A"]["price"])
    except Exception as e: print("P4 discount", repr(d), "->", type(e).__name__, e)

# P5: float money
l = {}; m.reconcile(l, {"A": {"qty": 1, "price": 19.99}}, 15); print("P5 19.99 at 15%:", repr(l["A"]["price"]))

# P6: missing key / bad feed row
try:
    m.reconcile({}, {"A": {"qty": 1}}, 0)
except Exception as e: print("P6 missing price ->", type(e).__name__, e)
try:
    m.reconcile({}, {"A": {"qty": "3", "price": 1}}, 0); m.reconcile({"A":{"qty":2,"price":1}}, {"A": {"qty": "3", "price": 1}}, 0)
except Exception as e: print("P6b string qty ->", type(e).__name__, e)

# P7: unclosed file handles (save_snapshot, run_sync line 36)
d = tempfile.mkdtemp(); os.chdir(d)
json.dump({"A": {"qty": 1, "price": 10}}, open("local.json","w")); json.dump({"A": {"qty": 2, "price": 10}}, open("remote.json","w"))
import io
with warnings.catch_warnings(record=True) as w:
    m.run_sync("local.json", "remote.json", 10); gc.collect()
    print("P7 ResourceWarnings:", [str(x.message)[:60] for x in w if issubclass(x.category, ResourceWarning)])
print("P8 snapshot written to cwd:", os.path.exists(os.path.join(d, "snapshot.json")))
# P9: non-atomic write: crash mid-dump leaves truncated snapshot
class Bad: pass
try: m.save_snapshot({"A": Bad()}, "snap2.json")
except Exception as e: print("P9 dump error ->", type(e).__name__, "| file left:", repr(open("snap2.json").read()))
