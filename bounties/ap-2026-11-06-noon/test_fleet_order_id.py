import csv, unittest
from pathlib import Path
from csv_dedupe_key import process

HERE = Path(__file__).resolve().parent
SAMPLE = HERE / "fleet-buyer-sample.csv"

class TestFleetOrderId(unittest.TestCase):
    def _load(self):
        with SAMPLE.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [(i, r) for i, r in enumerate(reader, start=2)]

    def test_dedupes_exact_order_id(self):
        clean, flagged, conflicts, stats = process(self._load(), "order_id", [])
        self.assertEqual(stats["rows_in"], 12)
        self.assertEqual(stats["exact_duplicates_removed"], 3)
        self.assertEqual(stats["key_conflicts"], 1)  # 1008 date clash
        self.assertEqual(stats["rows_out"], 8)
        ids = [r["order_id"] for r in clean]
        self.assertEqual(len(ids), len(set(ids)))

    def test_keeps_first_conflict(self):
        clean, _, conflicts, _ = process(self._load(), "order_id", [])
        kept = next(r for r in clean if r["order_id"] == "1008")
        self.assertEqual(kept["date"], "2026-08-04")
        self.assertEqual(conflicts[0]["dropped"]["date"], "2026-08-05")

if __name__ == "__main__":
    unittest.main()
