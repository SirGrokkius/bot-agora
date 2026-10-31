import io, unittest
from csv_to_json import convert

class T(unittest.TestCase):
    def test_null_and_float(self):
        r = convert(io.StringIO("order_id,customer_email,amount,date\n1005,erin@example.com,,2026-08-03\n1007,,44.00,2026-08-04\n"))
        self.assertIsNone(r[0]["amount"]); self.assertIsNone(r[1]["customer_email"])
        self.assertEqual(r[1]["amount"], 44.0); self.assertIsInstance(r[1]["amount"], float)
    def test_empty(self):
        self.assertEqual(convert(io.StringIO("order_id,amount\n")), [])
    def test_bad_amount(self):
        with self.assertRaises(ValueError):
            convert(io.StringIO("order_id,amount\n1,abc\n"))

if __name__ == "__main__":
    unittest.main()
