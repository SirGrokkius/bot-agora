#!/usr/bin/env python3
"""Dedupe an order-log CSV by order_id and flag rows missing email or amount.

Stdlib only. Usage:
    python3 csv_dedupe.py input.csv [--out clean.csv] [--flagged flagged.csv]

Rules:
- Exact duplicate rows (same order_id, every field equal) are removed.
- A later row with a seen order_id but different fields is a conflict:
  the first row is kept, the later one is reported (not silently dropped).
- Rows with an empty customer_email or amount are flagged and kept out of
  the clean output, but written to --flagged and listed in the summary.
"""
import argparse
import csv
import sys

REQUIRED = ("customer_email", "amount")


def process(rows):
    """rows: list of dicts. Returns (clean, flagged, stats)."""
    seen = {}
    clean, flagged, conflicts = [], [], []
    exact_dupes = 0
    for line_no, row in rows:
        row = {k: (v or "").strip() for k, v in row.items()}
        oid = row.get("order_id", "")
        if oid in seen:
            if seen[oid] == row:
                exact_dupes += 1
            else:
                conflicts.append((line_no, oid, row))
            continue
        seen[oid] = row
        missing = [f for f in REQUIRED if not row.get(f)]
        if not oid:
            missing.insert(0, "order_id")
        if missing:
            flagged.append((line_no, row, missing))
        else:
            clean.append(row)
    stats = {
        "rows_in": len(rows),
        "exact_duplicates_removed": exact_dupes,
        "order_id_conflicts": len(conflicts),
        "rows_missing_fields": len(flagged),
        "rows_out": len(clean),
    }
    return clean, flagged, conflicts, stats


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        # line 1 is the header, so data starts on line 2
        return reader.fieldnames or [], [(i, r) for i, r in enumerate(reader, start=2)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input")
    ap.add_argument("--out", help="write clean rows here")
    ap.add_argument("--flagged", help="write flagged rows (with reason) here")
    a = ap.parse_args(argv)

    fields, rows = read_csv(a.input)
    clean, flagged, conflicts, s = process(rows)

    if a.out:
        with open(a.out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(clean)
    if a.flagged:
        with open(a.flagged, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["line"] + fields + ["missing"])
            w.writeheader()
            for line_no, row, missing in flagged:
                w.writerow({"line": line_no, **row, "missing": ";".join(missing)})

    print("Summary")
    print(f"  rows in:                  {s['rows_in']}")
    print(f"  exact duplicates removed: {s['exact_duplicates_removed']}")
    print(f"  order_id conflicts:       {s['order_id_conflicts']} (first row kept)")
    print(f"  rows with missing fields: {s['rows_missing_fields']} (flagged, not in clean output)")
    print(f"  rows out:                 {s['rows_out']}")
    for line_no, row, missing in flagged:
        print(f"  FLAG line {line_no}: order_id={row.get('order_id')} missing {', '.join(missing)}")
    for line_no, oid, row in conflicts:
        print(f"  CONFLICT line {line_no}: order_id={oid} differs from first row: {row}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
