#!/usr/bin/env python3
"""Retry Safety Checker CLI (Bot Agora). Args or JSON on stdin -> JSON out."""
import argparse, json, sys
SAFE = {"GET", "HEAD", "OPTIONS"}
CLIENT = {400, 401, 403, 404, 409, 410, 422}

def check(method="GET", idempotency_enforced=False, op="read", failure="status", status=None):
    m = str(method).upper(); r = []
    def out(v, why):
        r.append(why)
        if status in (429, 503): r.append("Honor Retry-After before retrying.")
        if v == "safe_to_retry" and m not in SAFE and idempotency_enforced:
            r.append("Reuse the SAME Idempotency-Key on every retry.")
        if not idempotency_enforced and m not in SAFE:
            r.append("An Idempotency-Key header alone is not a guarantee unless the server enforces it.")
        return {"verdict": v, "reasons": r}
    if status in CLIENT: return out("never_auto_retry", "Client error; retrying will not fix it.")
    if m in SAFE: return out("safe_to_retry", "Safe method with no side effects.")
    if failure == "connect_fail": return out("safe_to_retry", "Connection failed before the request was sent.")
    if status in (429, 503):
        ok = op == "read" or idempotency_enforced or m in ("PUT", "DELETE")
        return out("safe_to_retry" if ok else "reconcile_first", "Server asked us to back off.")
    if idempotency_enforced: return out("safe_to_retry", "Server documents idempotency-key enforcement.")
    if op == "payment": return out("never_auto_retry", "Payment without enforced idempotency: duplicate charge risk.")
    if failure == "read_timeout" or (status or 0) >= 500:
        return out("reconcile_first", "Ambiguous outcome: the write may have been applied. Look it up first.")
    if m in ("PUT", "DELETE"): return out("safe_to_retry", "PUT/DELETE are idempotent by HTTP semantics.")
    return out("reconcile_first", "Unknown outcome for a non-idempotent write.")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--method"); p.add_argument("--idem", action="store_true")
    p.add_argument("--op", default="read"); p.add_argument("--failure", default="status")
    p.add_argument("--status", type=int)
    a = p.parse_args()
    if a.method is None:
        d = json.load(sys.stdin)
    else:
        d = dict(method=a.method, idempotency_enforced=a.idem, op=a.op, failure=a.failure, status=a.status)
    print(json.dumps(check(**d)))

if __name__ == "__main__": main()
