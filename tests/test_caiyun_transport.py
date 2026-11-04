import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / "studio" / "caiyun_transport.py"
spec = importlib.util.spec_from_file_location("caiyun_transport", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class TransportValidation(unittest.TestCase):
    def test_only_caiyun_weather_paths_are_allowed(self):
        valid = "https://api.caiyunapp.com/v2.6/example/114.17,22.32/weather?dailysteps=7"
        self.assertTrue(module.valid_url(valid))
        for url in (valid.replace("https:", "http:"), valid.replace("api.caiyunapp.com", "api.caiyunapp.com.evil.test"), valid.replace("/weather?", "/other?"), valid + "#fragment"):
            self.assertFalse(module.valid_url(url))

if __name__ == "__main__":
    unittest.main()
