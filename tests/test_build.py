import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('dashboard_build', ROOT / 'tools/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class BuildTests(unittest.TestCase):
    def test_default_build_is_portable_and_generic(self):
        html, packages = builder.build()
        self.assertEqual(len(packages), 6)
        self.assertIn('id="dashboard-config"', html)
        self.assertIn('data:image/svg+xml;base64,', html)
        self.assertNotIn('chatgpt.com/dots/', html)
        self.assertNotIn('{{COMPANION_', html)
        self.assertNotIn('<footer', html)

    def test_paths_cannot_escape_package(self):
        with self.assertRaises(ValueError): builder.member(ROOT / 'panels', '../tools/build.py')
        with self.assertRaises(ValueError): builder.member(ROOT, str(ROOT / 'tools/build.py'))
        with self.assertRaises(ValueError): builder.load_package('../clock')

    def test_duplicate_ids_are_rejected(self):
        with self.assertRaises(ValueError): builder.IdChecker().feed('<div id="x"></div><span id="x"></span>')

    def test_config_rejects_script_urls(self):
        (ROOT / 'dist').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT / 'dist') as folder:
            path=Path(folder)/'config.json'
            path.write_text(json.dumps({'companion':{'chatUrl':'javascript:alert(1)'}}))
            with self.assertRaises(ValueError): builder.load_config(path)

if __name__ == '__main__': unittest.main()
