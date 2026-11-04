const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../studio/m3-design.js');
test('contrast uses WCAG linear luminance and unrounded thresholds', () => {
  assert.equal(m.contrast('#000000', '#ffffff'), 21);
  assert.equal(m.contrast('#123456', '#123456'), 1);
  assert.equal(m.assess(4.499).body, false);
  assert.equal(m.assess(4.5).body, true);
  assert.equal(m.assess(3).large, true);
  assert.equal(m.assess(null).body, null);
  assert.equal(m.contrast('transparent', '#ffffff'), null);
});
test('pair recommendation and missing roles remain unverified', () => {
  assert.equal(m.expectedForeground('primaryContainer'), 'onPrimaryContainer');
  assert.equal(m.expectedForeground('surfaceContainerHigh'), 'onSurface');
  assert.equal(m.calculate({bright: {primary: '#000000'}}, 'primary', 'onPrimary').bright.ratio, null);
});
test('readiness requires budget, critical scores and tested gates', () => {
  const args = ['Expressive', 'Time', [true, true, true], Array(10).fill(2), ['Pass']];
  assert.equal(m.readiness(...args).ready, true);
  assert.equal(m.readiness(...args.slice(0, 4), ['Untested']).ready, false);
  assert.equal(m.readiness('Quiet', 'Time', [true, true, true], Array(10).fill(2), ['Pass']).ready, false);
  for (const critical of [0, 7, 8]) {
    const scores = Array(10).fill(2);
    scores[critical] = 0;
    assert.equal(m.readiness('Expressive', 'Time', [true, true, true], scores, ['Pass']).ready, false);
  }
});

test('all hard gates must exist and not-applicable requires evidence', () => {
  const gates = Array.from({length: 15}, () => ({status: 'Pass', note: ''}));
  assert.equal(m.gatesComplete(gates, 15), true);
  assert.equal(m.gatesComplete(gates.slice(1), 15), false);
  gates[0] = {status: 'Untested', note: ''};
  assert.equal(m.gatesComplete(gates, 15), false);
  gates[0] = {status: 'Not applicable', note: ' '};
  assert.equal(m.gatesComplete(gates, 15), false);
  gates[0].note = 'Display-only panel';
  assert.equal(m.gatesComplete(gates, 15), true);
});
