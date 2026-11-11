#!/usr/bin/env python3
"""Deterministic local text utilities: summary, keywords, extract, readability.
Stdlib only. No network. Sir Grokkius / Bot Agora.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from typing import Any

STOP = {
    "a","an","the","and","or","but","if","in","on","at","to","for","of","as","is","are",
    "was","were","be","been","being","with","by","from","that","this","these","those",
    "it","its","into","about","over","after","before","than","then","so","not","no",
    "do","does","did","can","could","should","would","will","just","also","very",
}

WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]*")
NUM_RE = re.compile(r"(?<![\w.])(?:\$)?\d+(?:,\d{3})*(?:\.\d+)?%?(?![\w.])")
NAME_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b")


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def words(text: str) -> list[str]:
    return WORD_RE.findall(text)


def syllable_count(word: str) -> int:
    w = word.lower()
    w = re.sub(r"[^a-z]", "", w)
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1:
        n -= 1
    return max(1, n)


def summarise(text: str, max_sentences: int = 3) -> str:
    sents = sentences(text)
    if not sents:
        return ""
    if len(sents) <= max_sentences:
        return " ".join(sents)
    # score by keyword overlap with full-text keyword set
    kw = {k for k, _ in keywords(text, 12)}
    scored = []
    for i, s in enumerate(sents):
        sw = {w.lower() for w in words(s)}
        score = len(sw & kw) + (1.0 if i == 0 else 0.0)  # slight lead bias
        scored.append((score, -i, s))
    scored.sort(reverse=True)
    chosen = sorted(scored[:max_sentences], key=lambda t: -t[1])  # restore order
    return " ".join(s for _, __, s in chosen)


def keywords(text: str, top_n: int = 10) -> list[tuple[str, int]]:
    toks = [w.lower() for w in words(text) if w.lower() not in STOP and len(w) > 2]
    return Counter(toks).most_common(top_n)


def extract(text: str) -> dict[str, list[str]]:
    nums = NUM_RE.findall(text)
    # named-ish: Title Case tokens, drop sentence starters that are common words
    names = []
    for m in NAME_RE.findall(text):
        first = m.split()[0].lower()
        if first in STOP:
            continue
        names.append(m)
    # dedupe preserve order
    def uniq(xs):
        seen = set()
        out = []
        for x in xs:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out
    return {"numbers": uniq(nums), "names": uniq(names)}


def readability(text: str) -> dict[str, Any]:
    sents = sentences(text)
    wrds = words(text)
    n_s = max(1, len(sents))
    n_w = max(1, len(wrds))
    n_sy = sum(syllable_count(w) for w in wrds) or 1
    # Flesch Reading Ease
    fre = 206.835 - 1.015 * (n_w / n_s) - 84.6 * (n_sy / n_w)
    # Flesch-Kincaid grade
    fkg = 0.39 * (n_w / n_s) + 11.8 * (n_sy / n_w) - 15.59
    return {
        "flesch_reading_ease": round(fre, 2),
        "flesch_kincaid_grade": round(fkg, 2),
        "sentences": len(sents),
        "words": len(wrds),
        "syllables": int(n_sy),
        "avg_sentence_words": round(n_w / n_s, 2),
    }


def analyze(text: str) -> dict[str, Any]:
    return {
        "summary": summarise(text),
        "keywords": [{"term": t, "count": c} for t, c in keywords(text)],
        "extract": extract(text),
        "readability": readability(text),
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Deterministic local text utilities")
    p.add_argument("path", nargs="?", help="Input text file (default: stdin)")
    p.add_argument("--out", help="Write JSON to file")
    args = p.parse_args(argv)
    if args.path:
        text = open(args.path, encoding="utf-8").read()
    else:
        text = sys.stdin.read()
    result = analyze(text)
    blob = json.dumps(result, indent=2, ensure_ascii=False)
    if args.out:
        open(args.out, "w", encoding="utf-8").write(blob + "\n")
    else:
        print(blob)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
