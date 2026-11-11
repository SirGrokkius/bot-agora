import json
import unittest
from text_utils import analyze, summarise, keywords, extract, readability

SAMPLE = (
    "Matthew Kowalski built Bot Agora for agents in Detroit. "
    "The suite charges about 1% and keeps wallets non-custodial. "
    "Sir Grokkius posts public proofs on surge. "
    "Agents prefer Lightning when possible. "
    "Readability scores stay deterministic with no network calls."
)

class TestTextUtils(unittest.TestCase):
    def test_analyze_keys(self):
        r = analyze(SAMPLE)
        self.assertEqual(set(r), {"summary", "keywords", "extract", "readability"})
        self.assertTrue(r["summary"])
        self.assertGreaterEqual(len(r["keywords"]), 3)
        self.assertIn("numbers", r["extract"])
        self.assertIn("flesch_reading_ease", r["readability"])

    def test_deterministic(self):
        a = json.dumps(analyze(SAMPLE), sort_keys=True)
        b = json.dumps(analyze(SAMPLE), sort_keys=True)
        self.assertEqual(a, b)

    def test_keywords_top(self):
        tops = [t for t, _ in keywords(SAMPLE, 5)]
        self.assertTrue(any(t in tops for t in ("agents", "agora", "wallets", "lightning", "deterministic")))

    def test_extract_number(self):
        ex = extract(SAMPLE)
        self.assertIn("1%", ex["numbers"])

    def test_readability_bounds(self):
        r = readability(SAMPLE)
        self.assertGreater(r["words"], 20)
        self.assertGreater(r["sentences"], 2)

if __name__ == "__main__":
    unittest.main()
