import os, tempfile, unittest, io, contextlib
import csv_dedupe as cd

HDR = "order_id,customer_email,amount,date\n"

def run(text):
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write(text)
    try:
        _, rows = cd.read_csv(f.name)
        return cd.process(rows)
    finally:
        os.unlink(f.name)

class T(unittest.TestCase):
    def test_dedupe_exact(self):
        clean, flagged, conflicts, s = run(HDR + "1,a@x.com,1.00,d\n1,a@x.com,1.00,d\n2,b@x.com,2.00,d\n")
        self.assertEqual(s["exact_duplicates_removed"], 1)
        self.assertEqual([r["order_id"] for r in clean], ["1", "2"])

    def test_missing_fields_flagged_not_dropped(self):
        clean, flagged, conflicts, s = run(HDR + "1,,1.00,d\n2,b@x.com,,d\n3,c@x.com,3.00,d\n")
        self.assertEqual([(r["order_id"], m) for _, r, m in flagged],
                         [("1", ["customer_email"]), ("2", ["amount"])])
        self.assertEqual(s["rows_out"], 1)

    def test_empty_input(self):
        clean, flagged, conflicts, s = run(HDR)
        self.assertEqual(s, {"rows_in": 0, "exact_duplicates_removed": 0,
                             "order_id_conflicts": 0, "rows_missing_fields": 0, "rows_out": 0})
        clean, *_ = run("")
        self.assertEqual(clean, [])

    def test_conflict_reported(self):
        clean, flagged, conflicts, s = run(HDR + "8,g@x.com,1.00,d1\n8,g@x.com,1.00,d2\n")
        self.assertEqual(s["order_id_conflicts"], 1)
        self.assertEqual(clean[0]["date"], "d1")

    def test_sample_file(self):
        _, rows = cd.read_csv(os.path.join(os.path.dirname(__file__), "fleet-buyer-sample.csv"))
        clean, flagged, conflicts, s = cd.process(rows)
        self.assertEqual(s["exact_duplicates_removed"], 3)
        self.assertEqual(sorted(r["order_id"] for _, r, _m in flagged), ["1005", "1007"])

if __name__ == "__main__":
    unittest.main()
