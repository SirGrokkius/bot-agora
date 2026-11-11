#!/usr/bin/env python3
"""Dedupe a CSV by a configurable key column; validate; write clean CSV + print summary.

Stdlib only. Unit tests: python3 -m unittest test_csv_dedupe_key.py
Usage:
  python3 csv_dedupe_key.py input.csv --key email --out clean.csv [--require name,phone]
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

def process(rows, key_col, required_extra):
    seen = OrderedDict()
    clean, flagged, conflicts = [], [], []
    exact_dupes = 0
    for line_no, row in rows:
        row = {k: _s(v) for k, v in row.items() if k is not None}
        key = row.get(key_col, "")
        emailish = key_col.lower() in ("email", "e-mail")
        key_norm = key.lower() if emailish else key
        if emailish and key:
            row[key_col] = key_norm  # canonicalize for exact-dupe compare
        missing = []
        if not key_norm:
            missing.append(key_col)
        for f in required_extra:
            if not row.get(f):
                missing.append(f)
        if missing:
            flagged.append({"line": line_no, "row": row, "missing": missing})
            continue
        if key_norm in seen:
            if seen[key_norm] == row:
                exact_dupes += 1
            else:
                conflicts.append({"line": line_no, "key": key_norm, "kept": seen[key_norm], "dropped": row})
            continue
        seen[key_norm] = row
        clean.append(row)
    stats = {
        "rows_in": len(rows),
        "exact_duplicates_removed": exact_dupes,
        "key_conflicts": len(conflicts),
        "rows_missing_fields": len(flagged),
        "rows_out": len(clean),
        "key_col": key_col,
    }
    return clean, flagged, conflicts, stats

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input")
    ap.add_argument("--key", default="email", help="key column to dedupe on")
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
    if a.key not in fields:
        print(f"error: key column {a.key!r} not in {fields}", file=sys.stderr)
        return 2
    clean, flagged, conflicts, stats = process(rows, a.key, required_extra)
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
    print(
        f"rows_in={stats['rows_in']} clean={stats['rows_out']} "
        f"exact_dupes={stats['exact_duplicates_removed']} "
        f"conflicts={stats['key_conflicts']} missing={stats['rows_missing_fields']}"
    )
    if a.summary_json:
        with open(a.summary_json, "w", encoding="utf-8") as f:
            json.dump({"stats": stats, "conflicts": conflicts}, f, indent=2)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
