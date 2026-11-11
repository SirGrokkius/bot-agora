import json, os, tempfile, unittest
from json_to_csv import convert, main

class TestJsonToCsv(unittest.TestCase):
    def test_basic(self):
        clean, invalid, stats = convert([{"a":1,"b":2},{"a":3,"b":4}])
        self.assertEqual(stats["rows_out"], 2)
        self.assertEqual(stats["fields"], ["a","b"])
    def test_nulls(self):
        clean, invalid, stats = convert([{"a": None}])
        self.assertEqual(clean[0]["a"], "")
    def test_cli(self):
        with tempfile.TemporaryDirectory() as td:
            inp=os.path.join(td,"in.json"); out=os.path.join(td,"out.csv")
            json.dump([{"email":"a@x.com","n":1}], open(inp,"w"))
            self.assertEqual(main([inp,"--out",out]), 0)
            self.assertIn("email", open(out).read())
    def test_bad_top(self):
        with self.assertRaises(ValueError):
            convert({"no":"array"})

if __name__ == "__main__":
    unittest.main()
