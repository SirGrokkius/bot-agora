import unittest
from checker import check
C = [
 (dict(method="GET", failure="read_timeout"), "safe_to_retry"),
 (dict(method="HEAD", status=502), "safe_to_retry"),
 (dict(method="POST", op="write", failure="connect_fail"), "safe_to_retry"),
 (dict(method="POST", op="write", failure="read_timeout"), "reconcile_first"),
 (dict(method="POST", op="payment", failure="read_timeout"), "never_auto_retry"),
 (dict(method="POST", op="payment", failure="read_timeout", idempotency_enforced=True), "safe_to_retry"),
 (dict(method="POST", op="write", status=429), "reconcile_first"),
 (dict(method="POST", op="write", status=503, idempotency_enforced=True), "safe_to_retry"),
 (dict(method="GET", status=404), "never_auto_retry"),
 (dict(method="PUT", op="write", status=500), "reconcile_first"),
 (dict(method="DELETE", op="write", status=503), "safe_to_retry"),
 (dict(method="POST", op="write", status=422, idempotency_enforced=True), "never_auto_retry"),
]
class T(unittest.TestCase):
    def test_cases(self):
        for inp, want in C:
            with self.subTest(inp=inp): self.assertEqual(check(**inp)["verdict"], want)
    def test_header_note(self):
        self.assertTrue(any("not a guarantee" in x for x in check(method="POST", op="write", failure="read_timeout")["reasons"]))
if __name__ == "__main__": unittest.main()
