#!/usr/bin/env python3
"""Dedupe a CSV by email column; validate rows; write clean CSV + summary.

Stdlib only.
Usage:
  python3 csv_dedupe_email.py input.csv [--email-col email] [--out clean.csv] [--flagged flagged.csv]
"""
from __future__ import annotations
import argparse, csv, json, sys
from collections import OrderedDict

def _s(v):
    if v is None:
        return ""
    if isinstance(v, (list, tuple)):
        return ";".join(_s(x) for x in v)
    return str(v).strip()

def process(rows, email_col, required_extra):
    seen = OrderedDict()
    clean, flagged, conflicts = [], [], []
    exact_dupes = 0
    for line_no, row in rows:
        row = {k: _s(v) for k, v in row.items() if k is not None}
        email = row.get(email_col, "").lower()
        missing = []
        if not email:
            missing.append(email_col)
        for f in required_extra:
            if not row.get(f):
                missing.append(f)
        if missing:
            flagged.append({"line": line_no, "row": row, "missing": missing})
            continue
        if email in seen:
            if seen[email] == row:
                exact_dupes += 1
            else:
                conflicts.append({"line": line_no, "email": email, "kept": seen[email], "dropped": row})
            continue
        seen[email] = row
        clean.append(row)
    stats = {
        "rows_in": len(rows),
        "exact_duplicates_removed": exact_dupes,
        "email_conflicts": len(conflicts),
        "rows_missing_fields": len(flagged),
        "rows_out": len(clean),
        "email_col": email_col,
    }
    return clean, flagged, conflicts, stats

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input")
    ap.add_argument("--email-col", default="email")
    ap.add_argument("--require", default="", help="comma-separated extra required columns")
    ap.add_argument("--out")
    ap.add_argument("--flagged")
    ap.add_argument("--summary-json")
    a = ap.parse_args(argv)
    required_extra = [x.strip() for x in a.require.split(",") if x.strip()]
    with open(a.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = [c for c in (reader.fieldnames or []) if c]
        rows = [(i, r) for i, r in enumerate(reader, start=2)]
    if a.email_col not in fields:
        print(f"error: email column {a.email_col!r} not in {fields}", file=sys.stderr)
        return 2
    clean, flagged, conflicts, stats = process(rows, a.email_col, required_extra)
    if a.out:
        with open(a.out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            w.writeheader(); w.writerows(clean)
    if a.flagged:
        with open(a.flagged, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["line"] + fields + ["missing"], extrasaction="ignore")
            w.writeheader()
            for item in flagged:
                w.writerow({"line": item["line"], **item["row"], "missing": ";".join(item["missing"])})
    summary = {"stats": stats, "conflicts": conflicts}
    print(
        f"rows_in={stats['rows_in']} clean={stats['rows_out']} "
        f"exact_dupes={stats['exact_duplicates_removed']} "
        f"conflicts={stats['email_conflicts']} missing={stats['rows_missing_fields']}"
    )
    if a.summary_json:
        with open(a.summary_json, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
