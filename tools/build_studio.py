#!/usr/bin/env python3
"""Build the browser-local Panel Studio, using the current dashboard contract/runtime."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def build_studio():
    def read(name):
        return (ROOT / name).read_text()

    def encoded(value):
        return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c')

    examples = []
    for panel_id in json.loads(read('panels/catalog.json'))['panels']:
        manifest = json.loads(read(f'panels/{panel_id}/panel.json'))
        names = ['panel.json', *manifest['entries'].values()]
        examples.append({'id': panel_id, 'title': manifest['title'], 'files': {name: read(f'panels/{panel_id}/{name}') for name in names}})
    tokens = json.loads(read('themes/material-tokens.json'))['themes']
    colors = '\n'.join('html[data-theme=' + mode + ']{' + '\n'.join('--md-sys-color-' + re.sub(r'[A-Z]', lambda m: '-' + m[0].lower(), key) + ':' + value + ';' for key, value in roles.items()) + '}' for mode, roles in tokens.items())
    shared_css = '\n'.join(read(name) for name in ['web/styles/base.css', 'web/styles/theme.css', 'web/styles/panel-fit.css']) + colors
    data = {'schema': json.loads(read('schemas/panel.schema.json')), 'examples': examples, 'sharedCss': shared_css, 'themes': tokens,
            'runtime': read('logic/panel-runtime.js'), 'fit': read('logic/panel-fit.js'), 'expansion': read('logic/panel-expansion.js'), 'attention': read('logic/panel-attention.js'), 'frame': read('studio/frame.js'),
            'dataAPI': read('studio/data-api.js'), 'provider': read('logic/device-provider.js')}
    html = read('studio/index.html')
    def inline_script(source):
        return re.sub(r'</script', lambda _: '<\\/script', source, flags=re.I)

    replacements = {'/* STUDIO_STYLES */': read('studio/styles.css'), '/* STUDIO_DATA */': encoded(data), '/* STUDIO_PACKAGE */': inline_script(read('logic/panel-package.js')), '/* STUDIO_EXPANSION */': inline_script(data['expansion']), '/* STUDIO_DATA_API */': inline_script(data['dataAPI']), '/* STUDIO_APP */': inline_script(read('studio/app.js'))}
    for marker, value in replacements.items():
        html = html.replace(marker, value)
    for source in ['logic/panel-package.js', 'studio/app.js', 'studio/frame.js', 'studio/data-api.js']:
        result = subprocess.run(['node', '--check', str(ROOT / source)], capture_output=True, text=True)
        if result.returncode:
            raise ValueError(result.stderr)
    for script in re.findall(r'<script>([\s\S]*?)</script>', html):
        result = subprocess.run(['node', '--check'], input=script, text=True, capture_output=True)
        if result.returncode:
            raise ValueError('Generated Studio JavaScript: ' + result.stderr)
    return html


if __name__ == '__main__':
    target = ROOT / 'dist/studio/index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(build_studio())
    print(f'Built {target} (self-contained, generic, browser-local)')
