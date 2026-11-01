#!/usr/bin/env python3
"""Validate trusted panel packages and build one self-contained local HTML file."""
from argparse import ArgumentParser
from base64 import b64encode
from hashlib import sha256
from html import escape
from html.parser import HTMLParser
import json
import math
from urllib.parse import urlparse
import mimetypes
from pathlib import Path
import re
import subprocess
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT
ID = re.compile(r'^[a-z][a-z0-9-]{0,39}$')
CAPABILITIES = {'local-time', 'storage', 'network', 'location', 'microphone', 'external-navigation', 'device-service'}


def member(directory, name):
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError('Package entries must be relative file paths')
    path = (directory / name).resolve()
    if not path.is_relative_to(directory.resolve()) or not path.is_file():
        raise ValueError(f'Package entry is missing or escapes its directory: {name}')
    return path


def validate_expansion(manifest):
    e = manifest['expansion']
    def span(value):
        return isinstance(value, dict) and set(value) == {'columns', 'rows'} and type(value['columns']) is int and 1 <= value['columns'] <= 2 and type(value['rows']) is int and 1 <= value['rows'] <= 3
    if not isinstance(e, dict) or set(e) != {'sizes', 'pinch', 'events'} or type(e['pinch']) is not bool or not isinstance(e['sizes'], list) or not 1 <= len(e['sizes']) <= 6 or not isinstance(e['events'], dict):
        raise ValueError('Invalid expansion declaration')
    seen = set()
    for size in e['sizes']:
        if not span(size) or (size['columns'], size['rows']) in seen:
            raise ValueError('Invalid ordered expansion sizes')
        seen.add((size['columns'], size['rows']))
    if manifest.get('grid', {'columns': 1, 'rows': 1}) not in e['sizes']:
        raise ValueError('Expansion sizes must include default grid')
    for name, rule in e['events'].items():
        if not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9]{0,39}', name) or not isinstance(rule, dict) or rule.get('action') not in {'expand', 'retain', 'restore'}:
            raise ValueError('Invalid expansion event')
        if rule['action'] == 'expand':
            if set(rule) != {'action', 'size'} or not span(rule['size']) or rule['size'] not in e['sizes']:
                raise ValueError('Undeclared event expansion size')
        elif set(rule) != {'action'}:
            raise ValueError('Invalid expansion event properties')

def load_package(panel_id):
    if not isinstance(panel_id, str) or not ID.fullmatch(panel_id):
        raise ValueError(f'Invalid panel ID: {panel_id!r}')
    directory = ROOT / 'panels' / panel_id
    manifest = json.loads((directory / 'panel.json').read_text())
    required = {'schemaVersion', 'id', 'title', 'version', 'rootClass', 'colorRole', 'entries', 'capabilities', 'assets', 'defaultEnabled'}
    if not required <= manifest.keys() or set(manifest) - required - {'networkOrigins', 'description', 'type', 'grid', 'expansion'}:
        raise ValueError(f'{panel_id}: missing or unknown manifest fields')
    if type(manifest['schemaVersion']) is not int or manifest['schemaVersion'] != 1 or manifest['id'] != panel_id:
        raise ValueError(f'{panel_id}: schema or identity mismatch')
    if not isinstance(manifest['title'], str) or not manifest['title'].strip():
        raise ValueError(f'{panel_id}: a title is required')
    if not re.fullmatch(r'\d+\.\d+\.\d+', manifest['version']):
        raise ValueError(f'{panel_id}: version must be major.minor.patch')
    if not ID.fullmatch(manifest['rootClass']) or manifest['colorRole'] not in {'primary', 'secondary', 'tertiary', 'surface'}:
        raise ValueError(f'{panel_id}: invalid class or color role')
    if 'description' in manifest and not isinstance(manifest['description'], str):
        raise ValueError(f'{panel_id}: description must be a string')
    if 'type' in manifest and (not isinstance(manifest['type'], str) or not manifest['type'].strip()):
        raise ValueError(f'{panel_id}: type must be a non-empty string')
    if 'grid' in manifest and (not isinstance(manifest['grid'], dict) or set(manifest['grid']) != {'columns', 'rows'} or type(manifest['grid']['columns']) is not int or not 1 <= manifest['grid']['columns'] <= 2 or type(manifest['grid']['rows']) is not int or not 1 <= manifest['grid']['rows'] <= 3):
        raise ValueError(f'{panel_id}: invalid grid size')
    if 'expansion' in manifest:
        validate_expansion(manifest)
    if not isinstance(manifest['defaultEnabled'], bool):
        raise ValueError(f'{panel_id}: defaultEnabled must be boolean')
    if not isinstance(manifest['capabilities'], list) or not all(isinstance(value, str) for value in manifest['capabilities']) or len(manifest['capabilities']) != len(set(manifest['capabilities'])) or not set(manifest['capabilities']) <= CAPABILITIES:
        raise ValueError(f'{panel_id}: invalid capabilities')
    if 'network' in manifest['capabilities'] and not manifest.get('networkOrigins'):
        raise ValueError(f'{panel_id}: network capability requires declared HTTPS origins')
    if 'networkOrigins' in manifest and (not isinstance(manifest['networkOrigins'], list) or not all(isinstance(value, str) for value in manifest['networkOrigins']) or len(manifest['networkOrigins']) != len(set(manifest['networkOrigins']))):
        raise ValueError(f'{panel_id}: invalid networkOrigins')
    for origin in manifest.get('networkOrigins', []):
        if not isinstance(origin, str) or not re.fullmatch(r'https://[a-zA-Z0-9.-]+(?::\d+)?', origin):
            raise ValueError(f'{panel_id}: networkOrigins must contain HTTPS origins, not paths or secrets')
    if not isinstance(manifest['entries'], dict) or set(manifest['entries']) != {'html', 'css', 'js'}:
        raise ValueError(f'{panel_id}: html, css and js entries are required')
    entries = {key: member(directory, name).read_text() for key, name in manifest['entries'].items()}
    if not isinstance(manifest['assets'], list) or not all(isinstance(value, str) for value in manifest['assets']) or len(manifest['assets']) != len(set(manifest['assets'])):
        raise ValueError(f'{panel_id}: assets must be an array')
    assets = {name: member(directory, name) for name in manifest['assets']}
    for key in ['html', 'css']:
        def embed(match):
            name = match.group(1)
            if name not in assets:
                raise ValueError(f'{panel_id}: undeclared asset: {name}')
            mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
            return 'data:' + mime + ';base64,' + b64encode(assets[name].read_bytes()).decode()
        entries[key] = re.sub(r'asset:([A-Za-z0-9_./-]+)', embed, entries[key])
    if re.search(r'<\s*script\b|\son[a-z]+\s*=', entries['html'], re.I):
        raise ValueError(f'{panel_id}: put script and event listeners in panel.js')
    if '</script' in entries['js'].lower() or '</style' in entries['css'].lower() or '@import' in entries['css'].lower():
        raise ValueError(f'{panel_id}: external CSS imports and closing wrapper tags are not allowed')
    # Package selectors must use their panel root or a package-prefixed class.
    css = re.sub(r'/\*.*?\*/', '', entries['css'], flags=re.S)
    for match in re.finditer(r'([^{}]+)\{', css):
        group = match.group(1).strip()
        if group.startswith('@'):
            continue
        if re.fullmatch(r'(from|to|[0-9.]+%)', group): continue
        for selector in group.split(','):
            if not (re.search(r'\.' + re.escape(panel_id) + r'-[a-zA-Z0-9_-]+', selector) or re.search(r'\[data-panel\s*=\s*["\']?' + re.escape(panel_id) + r'["\']?\]', selector)):
                raise ValueError(f'{panel_id}: unscoped CSS selector: {selector.strip()}')
    return manifest, entries, directory


class IdChecker(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == 'id':
                if value in self.ids:
                    raise ValueError(f'Duplicate HTML ID: {value}')
                self.ids.add(value)


def load_config(config_path=None):
    config = json.loads((ROOT / 'config.example.json').read_text())
    if config_path is not None:
        supplied = json.loads(Path(config_path).read_text())
        def merge(base, override):
            if not isinstance(override, dict) or set(override) - set(base):
                raise ValueError('Unknown configuration fields')
            for key, value in override.items():
                if isinstance(base[key], dict): merge(base[key], value)
                else: base[key] = value
        merge(config, supplied)
    companion = config['companion']
    if not isinstance(companion['name'], str) or not 1 <= len(companion['name']) <= 80:
        raise ValueError('Companion name must contain 1–80 characters')
    target = urlparse(companion['chatUrl'])
    if target.scheme != 'https' or not target.hostname or target.username or target.password:
        raise ValueError('Companion chatUrl must be an HTTPS URL without embedded credentials')
    member(ROOT, companion['avatar'])
    weather = config['weather']
    for key, limit in [('latitude', 90), ('longitude', 180)]:
        value = weather[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > limit:
            raise ValueError('Invalid weather coordinates')
    if not isinstance(weather['name'], str) or not weather['name'].strip() or not isinstance(weather['isPreview'], bool):
        raise ValueError('Invalid weather label')
    for key, minimum in [('idleTimeoutMs', 1000), ('weatherRefreshMs', 300000)]:
        value = config['display'][key]
        if type(value) is not int or not minimum <= value <= 86400000:
            raise ValueError('Invalid display timing')
    if not isinstance(config['storagePrefix'], str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{0,63}', config['storagePrefix']):
        raise ValueError('Invalid storage namespace')
    return config


def build(config_path=None):
    config = load_config(config_path)
    catalog = json.loads((ROOT / 'panels/catalog.json').read_text())
    ids = catalog['panels']
    if catalog.get('schemaVersion') != 1 or not isinstance(ids, list) or not ids or len(ids) != len(set(ids)):
        raise ValueError('The catalog must contain unique panel IDs under schemaVersion 1')
    packages = [load_package(panel_id) for panel_id in ids]
    html = (ROOT / 'web/template.html').read_text()
    shared_css = (ROOT / 'web/styles/base.css').read_text() + '\n/* PANEL_STYLES */\n' + (ROOT / 'web/styles/theme.css').read_text()
    html = html.replace('/* DASHBOARD_STYLES */', shared_css)
    core_modules = '\n'.join((ROOT / 'logic' / name).read_text() for name in ['storage.js', 'layout.js', 'panel-expansion.js', 'panel-attention.js', 'calendar-service.js', 'companion-service.js', 'device-provider.js'])
    html = html.replace('/* CORE_MODULES */', core_modules)
    html = html.replace('/* DASHBOARD_VERSION */', (ROOT / 'VERSION').read_text().strip())
    html = html.replace('/* PERSONALIZATION */', (ROOT / 'logic/personalization.js').read_text())
    html = html.replace('/* UPDATE_SCRIPT */', (ROOT / 'logic/update-ui.js').read_text())
    markup, styles, modules = [], [], []
    for manifest, entries, _ in packages:
        manifest = dict(manifest)
        if manifest['id'] == 'dot': manifest['title'] = config['companion']['name']
        panel_id, title = manifest['id'], manifest['title']
        tools = f'<div class="panel-tools"><button type="button" class="panel-handle" data-move="{panel_id}" aria-label="Move {escape(title, quote=True)} panel"><svg><use href="#grip-icon"/></svg></button><button type="button" class="panel-pin" data-pin="{panel_id}" aria-label="Pin {escape(title, quote=True)} panel" aria-pressed="false"><svg><use href="#pin-panel-icon"/></svg></button></div>'
        markup.append(f'<section class="panel {manifest["rootClass"]}" data-panel="{panel_id}" data-tone="{manifest["colorRole"]}" aria-label="{escape(title, quote=True)}">{tools}{entries["html"]}</section>')
        styles.append(entries['css'])
        encoded = json.dumps(manifest, ensure_ascii=False).replace('<', '\\u003c')
        modules.append(f'DisplayPanels.register({encoded},function(ctx){{\n{entries["js"]}\n}});')
    manifest_json = json.dumps({'schemaVersion': 1, 'panels': [dict(m, title=config['companion']['name']) if m['id']=='dot' else m for m, _, _ in packages]}, ensure_ascii=False).replace('<', '\\u003c')
    html = html.replace('<!-- PANEL_MARKUP -->', '\n'.join(markup)).replace('/* PANEL_STYLES */', '\n'.join(styles)).replace('<!-- PANEL_MANIFEST -->', '<script type="application/json" id="panel-manifest">' + manifest_json + '</script>').replace('/* PANEL_RUNTIME */', (ROOT / 'logic/panel-runtime.js').read_text()).replace('/* PANEL_MODULES */', '\n'.join(modules)).replace('/* APP_SCRIPT */', (ROOT / 'logic/app.js').read_text())
    avatar = member(ROOT, config['companion']['avatar'])
    avatar_url = 'data:' + (mimetypes.guess_type(avatar.name)[0] or 'application/octet-stream') + ';base64,' + b64encode(avatar.read_bytes()).decode()
    for key, value in {'COMPANION_NAME': config['companion']['name'], 'COMPANION_URL': config['companion']['chatUrl'], 'COMPANION_AVATAR': avatar_url}.items():
        html = html.replace('{{' + key + '}}', escape(value, quote=True))
    inline_config = json.loads(json.dumps(config))
    inline_config['companion'].pop('avatar')
    encoded_config = json.dumps(inline_config, ensure_ascii=False).replace('<', '\\u003c')
    html = html.replace('<script type="application/json" id="panel-manifest">', '<script type="application/json" id="dashboard-config">' + encoded_config + '</script>\n<script type="application/json" id="panel-manifest">')
    tokens = json.loads((ROOT / 'themes/material-tokens.json').read_text())['themes']
    css = '\n'.join('html[data-theme=' + mode + ']{\n' + '\n'.join('  --md-sys-color-' + re.sub(r'[A-Z]', lambda m: '-' + m[0].lower(), key) + ':' + value + ';' for key, value in roles.items()) + '\n}' for mode, roles in tokens.items())
    html = re.sub(r'/\* MATERIAL-YOU-TOKENS:START \*/.*?/\* MATERIAL-YOU-TOKENS:END \*/', '/* MATERIAL-YOU-TOKENS:START */\n' + css + '\n/* MATERIAL-YOU-TOKENS:END */', html, flags=re.S)
    IdChecker().feed(html)
    script = re.search(r'<script>\s*([\s\S]*?)</script>', html)[1]
    check = subprocess.run(['node', '--check'], input=script, text=True, capture_output=True)
    if check.returncode:
        raise ValueError(check.stderr)
    return html, packages


def bootstrap(html, config_path=None):
    config = load_config(config_path)
    avatar = member(ROOT, config['companion']['avatar'])
    avatar_url = 'data:' + (mimetypes.guess_type(avatar.name)[0] or 'application/octet-stream') + ';base64,' + b64encode(avatar.read_bytes()).decode()
    inline_config = json.loads(json.dumps(config))
    inline_config['companion'].pop('avatar')
    data = {'config': inline_config, 'avatar': avatar_url, 'bundle': {'version': (ROOT / 'VERSION').read_text().strip(), 'html': html}}
    encoded = b64encode(json.dumps(data, ensure_ascii=False).encode()).decode()
    script = (ROOT / 'logic/bootstrap.js').read_text().replace('/* BUILTIN_BASE64 */', encoded)
    return (ROOT / 'web/bootstrap.html').read_text().replace('/* BOOTSTRAP_SCRIPT */', script)


def package(panel_id):
    manifest, _, directory = load_package(panel_id)
    target = ROOT / 'dist/packages' / f'{panel_id}-{manifest["version"]}.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    names = ['panel.json'] + list(manifest['entries'].values()) + manifest['assets']
    with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:
        for name in sorted(set(names)):
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, member(directory, name).read_bytes())
    print(f'Package: {target.relative_to(PROJECT)}\nSHA-256: {sha256(target.read_bytes()).hexdigest()}')
    # A single-file variant embeds declared assets and is importable by the running dashboard.
    _, entries, _ = load_package(panel_id)
    portable = target.with_suffix('.json')
    portable.write_text(json.dumps({'format': 'thinkview-panel-1', 'manifest': manifest, 'entries': entries}, ensure_ascii=False))
    print(f'Runtime package: {portable.relative_to(PROJECT)}\nSHA-256: {sha256(portable.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='validate without writing HTML')
    parser.add_argument('--package', metavar='ID', help='export one portable panel ZIP')
    parser.add_argument('--output', metavar='PATH', default='dist/index.html', help='output path inside the ignored dist directory')
    parser.add_argument('--config', metavar='PATH', help='use an ignored local configuration override')
    parser.add_argument('--release-dir', metavar='PATH', help='write public generic release assets inside project .work')
    args = parser.parse_args()
    html, packages = build(args.config)
    if not args.check:
        target = (ROOT / args.output).resolve()
        if not target.is_relative_to(ROOT / 'dist'):
            raise ValueError('Build output must remain inside dist/')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(bootstrap(html, args.config))
        if args.release_dir:
            if args.config: raise ValueError('Public release assets cannot use a private configuration')
            release_dir = Path(args.release_dir).resolve()
            if not release_dir.is_relative_to(ROOT.parent / '.work'): raise ValueError('Release output must remain in the project .work directory')
            release_dir.mkdir(parents=True, exist_ok=True)
            payload = html.encode()
            (release_dir / 'thinkview-dashboard-bundle.html').write_bytes(payload)
            standalone = bootstrap(html).encode()
            (release_dir / 'thinkview-dashboard.html').write_bytes(standalone)
            (release_dir / 'SHA256SUMS').write_text(sha256(payload).hexdigest() + '  thinkview-dashboard-bundle.html\n' + sha256(standalone).hexdigest() + '  thinkview-dashboard.html\n')
    print(f'{"Validated" if args.check else "Built"} {len(packages)} panels; {len(html.encode()):,} bytes; JavaScript and IDs valid.')
    if args.package:
        package(args.package)
