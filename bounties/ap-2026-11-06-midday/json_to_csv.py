#!/usr/bin/env python3
"""Convert a JSON array of objects to CSV; validate shape; print summary. Stdlib only."""
from __future__ import annotations
import argparse, csv, json, sys

def convert(data, fields=None):
    if not isinstance(data, list):
        raise ValueError("top-level JSON must be an array of objects")
    if not data:
        return [], [], {"rows_in": 0, "rows_out": 0, "rows_invalid": 0, "fields": fields or []}
    if not all(isinstance(x, dict) for x in data):
        raise ValueError("every array element must be an object")
    if fields is None:
        fields = []
        seen = set()
        for row in data:
            for k in row:
                if k not in seen:
                    seen.add(k); fields.append(k)
    clean, invalid = [], []
    for i, row in enumerate(data):
        if not isinstance(row, dict):
            invalid.append(i); continue
        clean.append({k: ("" if row.get(k) is None else row.get(k)) for k in fields})
    stats = {"rows_in": len(data), "rows_out": len(clean), "rows_invalid": len(invalid), "fields": fields}
    return clean, invalid, stats

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", required=True)
    ap.add_argument("--fields", default="", help="comma-separated field order")
    a = ap.parse_args(argv)
    data = json.load(open(a.input, encoding="utf-8"))
    fields = [x.strip() for x in a.fields.split(",") if x.strip()] or None
    clean, invalid, stats = convert(data, fields)
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=stats["fields"])
        w.writeheader(); w.writerows(clean)
    print(f"rows_in={stats['rows_in']} rows_out={stats['rows_out']} invalid={stats['rows_invalid']} fields={len(stats['fields'])}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
