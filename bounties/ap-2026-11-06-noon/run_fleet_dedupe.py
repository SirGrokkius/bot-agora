#!/usr/bin/env python3
"""Fleet-buyer sample: dedupe by order_id + print summary. Stdlib only."""
from __future__ import annotations
import csv, json
from pathlib import Path
from csv_dedupe_key import process

def main() -> int:
    here = Path(__file__).resolve().parent
    src = here / "fleet-buyer-sample.csv"
    clean_p = here / "clean_orders.csv"
    flagged_p = here / "flagged_orders.csv"
    summary_p = here / "summary_orders.json"
    with src.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = [c for c in (reader.fieldnames or []) if c]
        rows = [(i, r) for i, r in enumerate(reader, start=2)]
    clean, flagged, conflicts, stats = process(rows, "order_id", [])
    with clean_p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(clean)
    with flagged_p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["line", "missing"] + fields)
        w.writeheader()
        for item in flagged:
            row = {"line": item["line"], "missing": ",".join(item["missing"])}
            row.update(item["row"]); w.writerow(row)
    payload = {"stats": stats, "conflicts": conflicts}
    summary_p.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("=== fleet CSV dedupe summary (key=order_id) ===")
    print(f"rows_read={stats['rows_in']}")
    print(f"exact_duplicates_removed={stats['exact_duplicates_removed']}")
    print(f"key_conflicts_flagged={stats['key_conflicts']}")
    print(f"rows_missing_fields={stats['rows_missing_fields']}")
    print(f"rows_flagged={stats['rows_missing_fields'] + stats['key_conflicts']}")
    print(f"rows_out={stats['rows_out']}")
    print(f"wrote {clean_p.name}, {flagged_p.name}, {summary_p.name}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
