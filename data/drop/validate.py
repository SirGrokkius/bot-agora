#!/usr/bin/env python3
"""Validate a Bot Agora dataset-only torrent drop submission.

We never download the torrent. We only check the magnet string and the
submitter's declared file list against the allowlist. Binary contents are
not inspected here; a human reviewer still has to look before listing.
"""
from __future__ import annotations

import re
from urllib.parse import parse_qs, unquote_plus, urlparse

ALLOW_EXT = {
    "csv", "tsv", "json", "jsonl", "parquet", "arrow", "txt",
    "sqlite", "xml", "npz", "npy", "h5",
}
# Optional sidecar names a reviewer may also accept in the file list:
SIDECAR_EXT = {"md", "sha256", "license"}
BLOCKED_EXT = {
    "exe", "dll", "so", "dylib", "bat", "cmd", "com", "msi", "scr", "pif",
    "sh", "ps1", "apk", "ipa", "app", "deb", "rpm",
    "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "iso", "dmg", "img",
    "mp3", "mp4", "mkv", "mov", "avi", "webm", "wav", "flac", "ogg", "m4a",
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "svg", "ico",
    "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",  # xlsx is not csv
    "js", "mjs", "cjs", "html", "htm", "wasm", "bin", "dmg",
}
BTIH_HEX = re.compile(r"^[a-fA-F0-9]{40}$")
BTIH_B32 = re.compile(r"^[A-Z2-7]{32}$")
FNAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")
MAGNET_OK_PARAMS = {"xt", "dn", "xl", "tr", "ws", "kt", "so", "x.pe"}


def ext_of(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def check_filename(name: str) -> str | None:
    n = name.strip().replace("\\", "/")
    if not n or n.startswith(".") or "/" in n or ".." in n:
        return f"bad path: {name!r}"
    if not FNAME.match(n):
        return f"filename must be a simple name (letters, digits, ._-): {name!r}"
    # reject file.csv.exe and any blocked suffix
    parts = n.lower().split(".")
    for p in parts[1:]:
        if p in BLOCKED_EXT:
            return f"blocked file type '.{p}' in {name!r}"
    ext = ext_of(n)
    if ext not in ALLOW_EXT and ext not in SIDECAR_EXT:
        return f"type '.{ext}' is not in the data allowlist for {name!r}"
    return None


def check_file_list(files: list[str]) -> list[str]:
    errs = []
    if not files:
        return ["file list is required"]
    dataish = 0
    seen = set()
    for name in files:
        e = check_filename(name)
        if e:
            errs.append(e)
            continue
        key = name.lower()
        if key in seen:
            errs.append(f"duplicate filename: {name}")
        seen.add(key)
        if ext_of(name) in ALLOW_EXT:
            dataish += 1
    if dataish == 0:
        errs.append("at least one allowlisted data file is required (not only sidecars)")
    return errs


def check_magnet(magnet: str) -> list[str]:
    errs = []
    m = (magnet or "").strip()
    if not m.lower().startswith("magnet:?"):
        return ["magnet link must start with magnet:?"]
    if any(s in m.lower() for s in ("javascript:", "data:", "<", ">", " ")):
        # spaces sometimes appear as %20 which is fine; raw space is sloppy but
        # treat as invalid to avoid paste accidents
        if "javascript:" in m.lower() or "data:" in m.lower() or "<" in m or ">" in m:
            return ["magnet link contains a blocked or unsafe substring"]
    parsed = urlparse(m)
    # urlparse may put params in query for magnet:?xt=...
    qs = parse_qs(parsed.query, keep_blank_values=True)
    if not qs:
        # some parsers leave the whole string in path
        q = m.split("?", 1)[-1]
        qs = parse_qs(q, keep_blank_values=True)
    unknown = [k for k in qs if k.lower() not in MAGNET_OK_PARAMS and not k.lower().startswith("x.")]
    if unknown:
        errs.append("unexpected magnet parameter: " + ", ".join(unknown[:5]))
    xts = qs.get("xt") or qs.get("XT") or []
    btih = None
    for xt in xts:
        xtu = unquote_plus(xt)
        low = xtu.lower()
        if low.startswith("urn:btih:"):
            btih = xtu.split(":", 2)[-1]
            break
        if low.startswith("urn:btmh:"):
            errs.append("v2-only (btmh) magnets need a v1 btih as well so we can show a stable id")
    if not btih:
        errs.append("magnet must include xt=urn:btih:<40-hex or 32-base32 infohash>")
    elif not (BTIH_HEX.match(btih) or BTIH_B32.match(btih.upper())):
        errs.append("infohash must be 40 hex characters or 32-character base32")
    return errs


def check_submission(obj: dict) -> list[str]:
    errs = []
    name = (obj.get("name") or "").strip()
    if len(name) < 3 or len(name) > 120:
        errs.append("dataset name must be 3–120 characters")
    license_ = (obj.get("license") or "").strip()
    if len(license_) < 2 or len(license_) > 80:
        errs.append("a short license name is required (for example CC BY 4.0 or CC0)")
    try:
        size = int(obj.get("size_bytes"))
        if size <= 0 or size > 50 * 1024 * 1024 * 1024:
            errs.append("size_bytes must be between 1 and 50 GB (we host nothing; this is a claim)")
    except (TypeError, ValueError):
        errs.append("size_bytes must be a whole number of bytes")
    files = obj.get("file_list") or []
    if isinstance(files, str):
        files = [x.strip() for x in files.replace(",", "\n").splitlines() if x.strip()]
    if not isinstance(files, list):
        errs.append("file_list must be a list of filenames")
        files = []
    # declared types must match the list
    declared = obj.get("file_types") or []
    if isinstance(declared, str):
        declared = [x.strip().lower().lstrip(".") for x in declared.replace(",", " ").split() if x.strip()]
    errs.extend(check_file_list(files))
    present = {ext_of(f) for f in files if check_filename(f) is None}
    if declared:
        extra = set(declared) - (ALLOW_EXT | SIDECAR_EXT)
        if extra:
            errs.append("declared file type not allowlisted: " + ", ".join(sorted(extra)))
        if present and not (set(declared) & present):
            errs.append("declared file_types do not match the file list")
    errs.extend(check_magnet(obj.get("magnet") or ""))
    for flag, msg in (
        (obj.get("attest_rights"), "you must attest you have the right to share this dataset"),
        (obj.get("attest_data_only"), "you must attest this torrent contains only allowlisted data files"),
        (obj.get("attest_no_pii"), "you must attest it contains no personal data"),
        (obj.get("attest_no_media"), "you must attest it is not copyrighted media, software, or an archive that hides other types"),
    ):
        if flag is not True and str(flag).lower() not in {"yes", "true", "on", "1"}:
            errs.append(msg)
    return errs


if __name__ == "__main__":
    import json, sys
    raw = json.loads(sys.stdin.read() if not sys.argv[1:] else open(sys.argv[1]).read())
    if isinstance(raw, list):
        items = raw
    elif "listings" in raw:
        items = raw["listings"]
    else:
        items = [raw]
    rc = 0
    for i, obj in enumerate(items):
        ev = check_submission(obj)
        if ev:
            rc = 1
            print(f"FAIL {obj.get('id') or obj.get('name') or i}:")
            for e in ev:
                print(" -", e)
        else:
            print("OK", obj.get("id") or obj.get("name") or i)
    sys.exit(rc)
