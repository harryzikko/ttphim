import runpy
import unittest
from pathlib import Path

validate = runpy.run_path(str(Path(__file__).with_name("validate-backend-url.py")))["validate"]


class BackendUrlTests(unittest.TestCase):
    def test_accepts_public_https_origin(self):
        self.assertEqual(validate("https://cinema.example.com"), "https://cinema.example.com")

    def test_rejects_missing_local_cleartext_or_unsafe_origins(self):
        for value in ["", "http://cinema.example.com", "https://localhost", "https://127.0.0.1", "https://[::1]",
                      "https://10.1.1.1", "https://192.168.1.2", "https://172.16.0.1", "https://169.254.169.254",
                      "https://server.local", "https://backend.test", "https://user:password@cinema.example.com",
                      "https://cinema.example.com/api", "https://cinema.example.com?q=x", "https://cinema.example.com:3001"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate(value)


if __name__ == "__main__":
    unittest.main()
