#!/usr/bin/env python3
"""Prune expired Bot Agora dataset torrent listings from listings.json.

Expired entries are appended to expired-archive.jsonl (append-only) and
removed from the live file. Never deletes the archive or other backups.
Safe to run from a daily cron or routine.

Usage:
  python3 prune-datadrop.py              # prune next to this script
  python3 prune-datadrop.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIVE = HERE / "listings.json"
ARCHIVE = HERE / "expired-archive.jsonl"


def parse_iso(s: str) -> datetime:
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s).astimezone(timezone.utc)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--file", type=Path, default=LIVE)
    args = ap.parse_args()
    path: Path = args.file
    data = json.loads(path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    keep, drop = [], []
    for item in data.get("listings", []):
        exp = item.get("expires_at")
        try:
            expired = parse_iso(exp) <= now
        except Exception:
            # broken expiry: leave in place for a reviewer, do not silently drop
            item = dict(item)
            item["_prune_error"] = "unreadable expires_at"
            keep.append(item)
            continue
        if expired:
            drop.append(item)
        else:
            keep.append(item)
    data["listings"] = keep
    data["updated"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    data["pruned_at"] = data["updated"]
    print(f"live={len(keep)} expired={len(drop)} now={data['updated']}")
    if args.dry_run or not drop:
        return 0
    # tape-friendly: copy current live file beside itself before rewrite
    bak = path.with_suffix(path.suffix + f".bak-{now.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(path, bak)
    with ARCHIVE.open("a", encoding="utf-8") as f:
        for item in drop:
            rec = dict(item)
            rec["archived_at"] = data["updated"]
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    print(f"wrote {path} (backup {bak.name})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
