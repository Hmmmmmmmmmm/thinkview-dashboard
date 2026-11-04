/* Pure authoring calculations; no panel source mutation. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioM3Design = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function luminance(color) {
    if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) return null;
    const values = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return x === null || y === null ? null : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function assess(ratio) {
    return {body: ratio === null ? null : ratio >= 4.5, large: ratio === null ? null : ratio >= 3, nonText: ratio === null ? null : ratio >= 3};
  }
  function expectedForeground(role) {
    if (role === 'surface' || /^surface(?:Container|Dim|Bright)/.test(role)) return 'onSurface';
    if (role === 'surfaceVariant') return 'onSurfaceVariant';
    if (role === 'inverseSurface') return 'inverseOnSurface';
    return /^(primary|secondary|tertiary|error)(Container)?$/.test(role) ? 'on' + role[0].toUpperCase() + role.slice(1) : null;
  }
  function calculate(themes, background, foreground) {
    return Object.fromEntries(Object.entries(themes).map(([name, roles]) => {
      const ratio = contrast(roles[background], roles[foreground]);
      return [name, {ratio, ...assess(ratio)}];
    }));
  }
  function readiness(profile, focal, tactics, scores, gates) {
    const limits = {Quiet: [0, 2], Standard: [0, 3], Expressive: [3, 5]};
    const budget = limits[profile];
    const count = tactics.filter(Boolean).length;
    const total = scores.reduce((a, b) => a + (Number.isInteger(b) ? b : 0), 0);
    const ready = !!budget && !!String(focal || '').trim() && count >= budget[0] && count <= budget[1] && scores.length === 10 && scores.every(n => Number.isInteger(n) && n >= 0 && n <= 2) && total >= 14 && [0, 7, 8].every(i => scores[i] > 0) && gates.length > 0 && gates.every(g => g === 'Pass' || g === 'Not applicable');
    return {count, total, ready};
  }
  function gatesComplete(entries, requiredCount) {
    return Array.isArray(entries) && entries.length === requiredCount && entries.every(g => g && (g.status === 'Pass' || (g.status === 'Not applicable' && typeof g.note === 'string' && g.note.trim())));
  }
  return {luminance, contrast, assess, expectedForeground, calculate, readiness, gatesComplete};
});

/* Browser workbench: metadata is separate from the package file map. */
(function (root) {
  'use strict';
  if (!root.document) return;
  const tactics = ['Shape', 'Color', 'Typography', 'Containment', 'Motion', 'Component flexibility', 'Hero moment'];
  const dimensions = ['Focal clarity', 'Hierarchy and ranking', 'Containment and grouping', 'Typography', 'Color', 'Shape', 'Motion', 'Content integrity', 'Accessibility', 'Restraint'];
  const gates = ['Job and focal point stated', 'Focal point survives grayscale', 'Body text size and essential text verified', 'Rendered text and non-text contrast verified', 'Interactive targets at least 48 × 48px', 'Focus visible and unobscured', 'Meaning does not rely on color alone', 'Labels retained', 'No fabricated data presented as real', 'Relevant empty, loading, stale, error and unavailable states', 'Reduced motion tested', '200% text tested', 'Light and dark contrast checked', 'Familiar interaction preserved', 'Color, type, shape, spacing and motion use tokens'];
  const fresh = () => ({profile: 'Expressive', focal: '', tactics: [], background: 'primaryContainer', foreground: 'onPrimaryContainer', scores: Array(10).fill(null), gates: Array.from({length: gates.length}, () => ({status: 'Untested', note: ''}))});
  function clean(raw) {
    const out = fresh();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    if (['Quiet', 'Standard', 'Expressive'].includes(raw.profile)) out.profile = raw.profile;
    for (const key of ['focal', 'background', 'foreground']) if (typeof raw[key] === 'string' && raw[key].length < 2048) out[key] = raw[key];
    if (Array.isArray(raw.tactics)) out.tactics = raw.tactics.filter(x => tactics.includes(x));
    if (Array.isArray(raw.scores)) out.scores = dimensions.map((_, i) => [0, 1, 2].includes(raw.scores[i]) ? raw.scores[i] : null);
    if (Array.isArray(raw.gates)) out.gates = gates.map((_, i) => ({status: ['Pass', 'Fail', 'Untested', 'Not applicable'].includes(raw.gates[i]?.status) ? raw.gates[i].status : 'Untested', note: typeof raw.gates[i]?.note === 'string' ? raw.gates[i].note.slice(0, 2048) : ''}));
    return out;
  }
  function mount(config) {
    const el = config.root;
    // Studio's editor chrome stays light while the specimen theme changes.
    if (config.themes.bright?.primary) el.style.setProperty('--md-sys-color-primary', config.themes.bright.primary);
    let span = '', current = null, workspace = '';
    const node = (tag, text, parent) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (parent) parent.append(n); return n; };
    const select = (parent, label, entries, value, change) => {
      const l = node('label', label, parent), s = node('select', null, l);
      for (const [v, text] of entries) { const o = node('option', text, s); o.value = v; }
      s.value = value; s.addEventListener('change', () => change(s.value)); return s;
    };
    function layouts() {
      const m = config.getManifest();
      const sizes = m?.expansion?.sizes?.length ? m.expansion.sizes : (m?.grid ? [m.grid] : []);
      return sizes.filter(x => Number.isInteger(x?.columns) && Number.isInteger(x?.rows)).map(x => x.columns + '×' + x.rows);
    }
    function resolve() {
      const m = config.getManifest(), spans = layouts();
      workspace = typeof m?.id === 'string' ? m.id : '';
      if (!spans.includes(span)) span = spans[0] || '';
      if (!workspace || !span) { current = null; return; }
      const meta = config.getMetadata();
      if (!meta.workspaces || typeof meta.workspaces !== 'object' || Array.isArray(meta.workspaces)) meta.workspaces = {};
      if (!Object.hasOwn(meta.workspaces, workspace) || !meta.workspaces[workspace] || typeof meta.workspaces[workspace] !== 'object' || Array.isArray(meta.workspaces[workspace])) Object.defineProperty(meta.workspaces, workspace, {value: {}, writable: true, enumerable: true, configurable: true});
      current = clean(Object.hasOwn(meta.workspaces[workspace], span) ? meta.workspaces[workspace][span] : null);
      meta.workspaces[workspace][span] = current;
    }
    function report() {
      if (!current) return {status: 'Unverified', message: 'Select a valid declared layout.'};
      const counts = StudioM3Design.readiness(current.profile, current.focal, tactics.map(t => current.tactics.includes(t)), current.scores, current.gates.map(g => g.status));
      const complete = StudioM3Design.gatesComplete(current.gates, gates.length);
      const ratios = StudioM3Design.calculate(config.themes, current.background, current.foreground);
      return {workspace, span, profile: current.profile, projectPolicy: 'Expressive', focal: current.focal, tactics: current.tactics, tacticCount: counts.count, scores: current.scores, total: counts.total, gates: gates.map((name, i) => ({name, ...current.gates[i]})), pair: {background: current.background, foreground: current.foreground, expectedForeground: StudioM3Design.expectedForeground(current.background), themes: ratios}, status: counts.ready && complete ? 'Design ready (manual review)' : 'Unverified', limitation: 'Role-pair calculations are not rendered panel contrast or accessibility certification; browser and device validation remain separate.'};
    }
    function update() {
      const r = report();
      if (config.onProfile) config.onProfile(current.profile, span);
      el.querySelector('[data-summary]').textContent = JSON.stringify(r, null, 2);
      el.querySelector('[data-readiness]').textContent = r.status + ' · ' + r.tacticCount + ' tactics · ' + r.total + '/20';
      const minmax = {Quiet: [0,2], Standard: [0,3], Expressive: [3,5]}[current.profile];
      el.querySelector('[data-budget]').textContent = 'Budget ' + minmax[0] + '–' + minmax[1] + ': ' + (r.tacticCount < minmax[0] || r.tacticCount > minmax[1] ? 'outside budget' : 'within budget') + (current.profile !== 'Expressive' ? ' · ThinkView project policy: Expressive' : '');
      const expected = StudioM3Design.expectedForeground(current.background);
      el.querySelector('[data-pair-warning]').textContent = expected && expected !== current.foreground ? 'Pair mismatch: expected ' + expected + '.' : expected ? 'Expected semantic pair.' : 'No expected on-role known; verify this pairing.';
      const mode = config.getTheme(), roles = config.themes[mode] || {}, specimen = el.querySelector('[data-specimen]');
      specimen.style.backgroundColor = roles[current.background] || ''; specimen.style.color = roles[current.foreground] || '';
      specimen.firstElementChild.textContent = 'Focal';
      el.querySelector('[data-recipe]').textContent = ({Quiet: 'Quiet: primary focal; neutral surface support. Use at most two tactics.', Standard: 'Standard: primary focal and neutral support; optional tertiary support. Use two or three tactics.', Expressive: 'Expressive: primary focal, neutral support and optional tertiary support. Combine three to five tactics.'})[current.profile] + ' Reserve error for actual attention.';
      const rows = el.querySelector('[data-ratios]'); rows.replaceChildren();
      for (const [theme, item] of Object.entries(r.pair.themes)) {
        const tr = node('tr', null, rows); node('th', theme, tr);
        node('td', item.ratio === null ? 'Unavailable' : item.ratio.toFixed(2) + ':1', tr);
        for (const key of ['body', 'large', 'nonText']) node('td', item[key] === null ? 'Unknown' : item[key] ? 'Pass' : 'Fail', tr);
      }
      el.querySelector('[data-snippet]').value = 'background: var(' + cssRole(current.background) + ');\ncolor: var(' + cssRole(current.foreground) + ');';
    }
    function cssRole(name) { return '--md-sys-color-' + name.replace(/[A-Z]/g, x => '-' + x.toLowerCase()); }
    function changed() { config.changed(); update(); }
    function refresh() {
      if (config.themes.bright?.primary) el.style.setProperty('--md-sys-color-primary', config.themes.bright.primary);
      resolve(); el.replaceChildren();
      if (!current) { node('p', 'Declare a valid panel ID and layout to use the workbench.', el); return; }
      const row = node('div', null, el); row.className = 'm3-controls';
      select(row, 'Declared layout', layouts().map(x => [x,x]), span, x => { span = x; refresh(); if (config.onSpanChange) config.onSpanChange(x); });
      select(row, 'Expression profile', ['Quiet','Standard','Expressive'].map(x => [x,x]), current.profile, x => { current.profile = x; changed(); });
      const focal = node('label', 'One focal point', row), input = node('input', null, focal); input.value = current.focal; input.maxLength = 500; input.addEventListener('input', () => { current.focal = input.value; changed(); });
      node('p', 'Profile changes the preview treatment for this layout. The package source is unchanged. Color style remains independent.', el);
      node('p', '', el).dataset.recipe = '';
      const field = node('fieldset', null, el); node('legend', 'Seven tactics', field);
      tactics.forEach(t => { const l = node('label', null, field); l.className = 'm3-check'; const c = node('input', null, l); c.type = 'checkbox'; c.checked = current.tactics.includes(t); l.append(document.createTextNode(t)); c.onchange = () => { current.tactics = tactics.filter(x => x === t ? c.checked : current.tactics.includes(x)); changed(); }; });
      node('p', '', el).dataset.budget = '';
      const pair = node('div', null, el); pair.className = 'm3-controls';
      const allRoles = [...new Set(Object.values(config.themes).flatMap(x => Object.keys(x)))].sort();
      const opts = allRoles.map(x => [x,x]);
      select(pair, 'Background role', opts, current.background, x => { current.background = x; const expected = StudioM3Design.expectedForeground(x); if (expected && allRoles.includes(expected)) current.foreground = expected; changed(); refresh(); });
      select(pair, 'Foreground role', opts, current.foreground, x => { current.foreground = x; changed(); });
      node('p', '', el).dataset.pairWarning = '';
      const specimen = node('div', null, el); specimen.className = 'm3-specimen'; specimen.dataset.specimen = ''; node('span', 'Focal', specimen);
      const table = node('table', null, el), head = node('tr', null, node('thead', null, table)); ['Theme','Ratio','Body 4.5','Large 3','Non-text 3'].forEach(x => node('th', x, head)); node('tbody', null, table).dataset.ratios = '';
      node('p', 'Role-pair calculation only; actual rendered panel contrast and accessibility are not certified.', el);
      const snippet = node('textarea', null, el); snippet.readOnly = true; snippet.rows = 2; snippet.dataset.snippet = ''; snippet.setAttribute('aria-label', 'CSS role pair snippet');
      const copy = node('button', 'Copy CSS pair', el); copy.type = 'button'; copy.onclick = () => copyText(snippet);
      const refs = node('details', null, el); node('summary', 'Type, shape, spacing and motion references', refs);
      node('p', 'Display small: 36px / 44px; body medium: 14px / 20px. Shape: large 16px, full 9999px. Spacing: 8px base, 12px panel padding. Effects fallback: 150ms; resolve instantly for reduced motion. These are reference values; define scoped aliases if the host does not supply them.', refs);
      const refText = node('textarea', null, refs); refText.readOnly = true; refText.rows = 5; refText.value = '--panel-focal-size: 2.25rem;\n--panel-group-radius: 16px;\n--panel-pill-radius: 9999px;\n--panel-gap: 8px;\n--panel-effects-duration: 150ms;'; refText.setAttribute('aria-label', 'Scoped token alias example'); const cp = node('button', 'Copy alias example', refs); cp.type = 'button'; cp.onclick = () => copyText(refText);
      const review = node('details', null, el); node('summary', 'Manual review and hard gates', review);
      node('p', 'Score each 0–2. Total ≥14, with no zero for focal clarity, content integrity or accessibility. All hard gates require Pass or evidenced Not applicable.', review);
      dimensions.forEach((d, i) => select(review, d, [['','Unscored'],['0','0'],['1','1'],['2','2']], current.scores[i] === null ? '' : String(current.scores[i]), x => { current.scores[i] = x === '' ? null : Number(x); changed(); }));
      gates.forEach((g, i) => { const group = node('div', null, review); group.className = 'm3-gate'; select(group, g, ['Untested','Pass','Fail','Not applicable'].map(x => [x,x]), current.gates[i].status, x => { current.gates[i].status = x; changed(); }); const l = node('label', 'Evidence / reason', group), n = node('input', null, l); n.value = current.gates[i].note; n.oninput = () => { current.gates[i].note = n.value; changed(); }; });
      node('p', '', el).dataset.readiness = '';
      const summary = node('textarea', null, el); summary.dataset.summary = ''; summary.readOnly = true; summary.rows = 8; summary.setAttribute('aria-label', 'Design report');
      const reportButton = node('button', 'Copy design report', el); reportButton.type = 'button'; reportButton.onclick = () => copyText(summary);
      const download = node('button', 'Download design report', el); download.type = 'button'; download.onclick = () => { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([summary.value], {type:'application/json'})); a.href = url; a.download = 'design-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      update();
    }
    function copyText(input) { input.focus(); input.select(); if (navigator.clipboard?.writeText) navigator.clipboard.writeText(input.value).catch(() => {}); }
    refresh();
    root.StudioDesignReport = Object.freeze({get: () => JSON.parse(JSON.stringify(report()))});
    return {refresh, setSpan(value) {
      if (!layouts().includes(value)) return false;
      if (span !== value) { span = value; refresh(); }
      else if (current && config.onProfile) config.onProfile(current.profile, span);
      return true;
    }};
  }
  root.StudioM3Workbench = Object.freeze({mount});
})(typeof globalThis !== 'undefined' ? globalThis : this);
