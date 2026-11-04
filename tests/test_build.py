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
        expected = json.loads((ROOT / "panels/catalog.json").read_text())["panels"]
        self.assertEqual(len(packages), 14)
        self.assertEqual([manifest["id"] for manifest, _, _ in packages], expected)
        self.assertIn('id="dashboard-config"', html)
        self.assertIn('data:image/svg+xml;base64,', html)
        self.assertNotIn('chatgpt.com/dots/', html)
        self.assertNotIn('{{COMPANION_', html)
        self.assertNotIn('<footer', html)

    def test_expansion_declaration_bounds_and_event_membership(self):
        manifest = json.loads((ROOT / 'panels/focus/panel.json').read_text())
        builder.validate_expansion(manifest)
        manifest['expansion']['sizes'].append({'columns': 3, 'rows': 1})
        with self.assertRaises(ValueError): builder.validate_expansion(manifest)
        manifest['expansion']['sizes'].pop()
        manifest['expansion']['events']['timerRun']['size'] = {'columns': 1, 'rows': 3}
        with self.assertRaises(ValueError): builder.validate_expansion(manifest)

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

    def test_studio_embeds_current_contract_runtime_and_source_examples(self):
        studio_spec = importlib.util.spec_from_file_location('studio_build', ROOT / 'tools/build_studio.py')
        studio = importlib.util.module_from_spec(studio_spec)
        studio_spec.loader.exec_module(studio)
        html = studio.build_studio()
        self.assertNotIn('/* STUDIO_', html)
        self.assertIn('sandbox="allow-scripts"', html)
        import re
        preview = re.search(r'<iframe\s+id="preview"[\s\S]*?</iframe>', html).group()
        blueprint = re.search(r'<iframe\s+id="blueprint"[^>]*>', html).group()
        self.assertIn('sandbox="allow-scripts"', preview)
        self.assertNotIn('allow-same-origin', preview)
        self.assertIn('sandbox="allow-same-origin"', blueprint)
        self.assertNotIn('allow-scripts', blueprint)
        import re
        data = json.loads(re.search(r'<script id="studio-data" type="application/json">([\s\S]*?)</script>', html)[1])
        self.assertEqual(data['schema'], json.loads((ROOT / 'schemas/panel.schema.json').read_text()))
        self.assertEqual(data['runtime'], (ROOT / 'logic/panel-runtime.js').read_text())
        self.assertEqual([example['id'] for example in data['examples']], json.loads((ROOT / 'panels/catalog.json').read_text())['panels'])
        self.assertEqual(data['provider'], (ROOT / 'logic/device-provider.js').read_text())
        self.assertEqual(data['dataAPI'], (ROOT / 'studio/data-api.js').read_text())
        self.assertEqual(data['themes'], json.loads((ROOT / 'themes/material-tokens.json').read_text())['themes'])
        self.assertNotIn('chatgpt.com/dots/', html)

if __name__ == '__main__': unittest.main()

class AssetMemberTests(unittest.TestCase):
    def test_nested_and_invalid_assets(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'dist') as folder:
            d = Path(folder)
            (d / 'assets/nested').mkdir(parents=True)
            (d / 'assets/nested/a.bin').write_bytes(b'\x00\xff')
            m = {'entries': {'html':'a.html','css':'a.css','js':'a.js'}, 'assets':['assets/']}
            self.assertEqual(builder.asset_members(d,m)['assets/nested/a.bin'].read_bytes(), b'\x00\xff')
            for declaration in ['missing/', '../escape', 'empty/']:
                (d / 'empty').mkdir(exist_ok=True)
                m['assets'] = [declaration]
                with self.assertRaises(ValueError): builder.asset_members(d,m)
            (d / 'assets/link').symlink_to(ROOT / 'tools/build.py')
            m['assets'] = ['assets/']
            with self.assertRaises(ValueError): builder.asset_members(d,m)
            m['assets'] = ['panel.json']
            (d / 'panel.json').write_text('{}')
            with self.assertRaises(ValueError): builder.asset_members(d,m)

class ExportFidelityTests(unittest.TestCase):
    def test_actual_export_preserves_all_asset_bytes(self):
        import base64
        from zipfile import ZipFile
        from unittest.mock import patch
        work = ROOT.parent / '.work/panel-studio'
        work.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=work) as tmp:
            root = Path(tmp)
            d = root / 'panels/mini'
            (d / 'assets/nested').mkdir(parents=True)
            manifest = {'schemaVersion':1,'id':'mini','title':'Mini','version':'1.0.0','rootClass':'mini','colorRole':'primary','entries':{'html':'panel.html','css':'panel.css','js':'panel.js'},'capabilities':[],'assets':['assets/'],'defaultEnabled':True}
            files = {'panel.json':json.dumps(manifest).encode(),'panel.html':b'<img src="asset:assets/nested/a.svg">','panel.css':b'','panel.js':b'','assets/nested/a.svg':b'<svg xmlns="http://www.w3.org/2000/svg"/>','assets/unused.bin':b'\x00\xff\x01'}
            for name, data in files.items(): (d / name).write_bytes(data)
            with patch.object(builder,'ROOT',root), patch.object(builder,'PROJECT',root): builder.package('mini')
            out=root/'dist/packages/mini-1.0.0'
            with ZipFile(Path(str(out) + '.zip')) as z:
                self.assertEqual(set(z.namelist()),set(files))
                for name,data in files.items(): self.assertEqual(z.read(name),data)
            pkg=json.loads(Path(str(out) + '.json').read_text())
            self.assertEqual(set(pkg['assetData']),{'assets/nested/a.svg','assets/unused.bin'})
            for name,value in pkg['assetData'].items(): self.assertEqual(base64.b64decode(value.split(',',1)[1]),files[name])
            self.assertIn(pkg['assetData']['assets/nested/a.svg'],pkg['entries']['html'])
