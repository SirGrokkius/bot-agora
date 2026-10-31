#!/usr/bin/env python3
"""Convert a CSV to a JSON array of objects. Stdlib only (csv, json).

- One object per row, keys from the header.
- Empty fields become null.
- amount becomes a float (null if empty; a non-numeric amount is an error
  that names the line).
Usage: python3 csv_to_json.py input.csv [-o out.json] [--numeric amount]
Prints the row count to stderr so stdout stays valid JSON.
"""
import argparse, csv, json, sys


def convert(fh, numeric=("amount",)):
    out = []
    for line_no, row in enumerate(csv.DictReader(fh), start=2):
        obj = {}
        for k, v in row.items():
            v = None if v is None or v.strip() == "" else v.strip()
            if v is not None and k in numeric:
                try:
                    v = float(v)
                except ValueError:
                    raise ValueError(f"line {line_no}: {k}={v!r} is not a number")
            obj[k] = v
        out.append(obj)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("-o", "--out")
    ap.add_argument("--numeric", action="append", help="numeric column (default: amount)")
    a = ap.parse_args(argv)
    with open(a.input, newline="", encoding="utf-8") as f:
        rows = convert(f, tuple(a.numeric or ["amount"]))
    text = json.dumps(rows, indent=2)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        print(text)
    print(f"rows: {len(rows)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
