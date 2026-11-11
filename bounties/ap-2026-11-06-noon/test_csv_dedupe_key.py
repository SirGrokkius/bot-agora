import csv, os, tempfile, unittest
from csv_dedupe_key import process, main

class TestCsvDedupeKey(unittest.TestCase):
    def _rows(self, text):
        import io
        r = csv.DictReader(io.StringIO(text))
        return [(i, row) for i, row in enumerate(r, start=2)], r.fieldnames

    def test_email_dedupe_case_insensitive(self):
        text = "email,name\nA@x.com,Ann\na@x.com,Ann\nb@x.com,Bob\n"
        rows, _ = self._rows(text)
        clean, flagged, conflicts, stats = process(rows, "email", [])
        self.assertEqual(stats["rows_out"], 2)
        self.assertEqual(stats["exact_duplicates_removed"], 1)
        self.assertEqual(len(flagged), 0)

    def test_conflict_keeps_first(self):
        text = "email,name\na@x.com,Ann\na@x.com,Anne\n"
        rows, _ = self._rows(text)
        clean, flagged, conflicts, stats = process(rows, "email", [])
        self.assertEqual(stats["rows_out"], 1)
        self.assertEqual(stats["key_conflicts"], 1)
        self.assertEqual(clean[0]["name"], "Ann")

    def test_missing_required(self):
        text = "email,name,phone\na@x.com,Ann,\nb@x.com,,555\n"
        rows, _ = self._rows(text)
        clean, flagged, conflicts, stats = process(rows, "email", ["name", "phone"])
        self.assertEqual(stats["rows_out"], 0)
        self.assertEqual(stats["rows_missing_fields"], 2)

    def test_order_id_key(self):
        text = "order_id,sku\n1,a\n1,a\n2,b\n"
        rows, _ = self._rows(text)
        clean, flagged, conflicts, stats = process(rows, "order_id", [])
        self.assertEqual(stats["rows_out"], 2)
        self.assertEqual(stats["exact_duplicates_removed"], 1)

    def test_empty_key_flagged(self):
        text = "email,name\n,Ann\nb@x.com,Bob\n"
        rows, _ = self._rows(text)
        clean, flagged, conflicts, stats = process(rows, "email", [])
        self.assertEqual(stats["rows_out"], 1)
        self.assertEqual(stats["rows_missing_fields"], 1)

    def test_cli_writes_out(self):
        with tempfile.TemporaryDirectory() as td:
            inp = os.path.join(td, "in.csv")
            out = os.path.join(td, "out.csv")
            with open(inp, "w", encoding="utf-8") as f:
                f.write("email,name\na@x.com,Ann\na@x.com,Ann\nb@x.com,Bob\n")
            rc = main([inp, "--key", "email", "--out", out])
            self.assertEqual(rc, 0)
            with open(out, encoding="utf-8") as f:
                lines = f.read().strip().splitlines()
            self.assertEqual(len(lines), 3)  # header + 2

    def test_cli_bad_key(self):
        with tempfile.TemporaryDirectory() as td:
            inp = os.path.join(td, "in.csv")
            with open(inp, "w", encoding="utf-8") as f:
                f.write("email,name\na@x.com,Ann\n")
            rc = main([inp, "--key", "nope"])
            self.assertEqual(rc, 2)

    def test_summary_json(self):
        with tempfile.TemporaryDirectory() as td:
            inp = os.path.join(td, "in.csv")
            sj = os.path.join(td, "s.json")
            with open(inp, "w", encoding="utf-8") as f:
                f.write("email,name\na@x.com,Ann\n")
            rc = main([inp, "--key", "email", "--summary-json", sj])
            self.assertEqual(rc, 0)
            import json
            data = json.load(open(sj))
            self.assertEqual(data["stats"]["rows_out"], 1)

if __name__ == "__main__":
    unittest.main()
