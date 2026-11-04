const {test} = require('node:test');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');

test('Studio color generation uses the Material Expressive and Tonal Spot roles for each seed', () => {
  const source = `
    import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier, context, next) {
      if (specifier.startsWith('.') && !/\\.[a-z0-9]+$/i.test(specifier)) specifier += '.js';
      return next(specifier, context);
    }});
    const {generate} = await import('./studio/color-engine.mjs');
    const {Hct} = await import('./node_modules/@material/material-color-utilities/hct/hct.js');
    const {DynamicScheme} = await import('./node_modules/@material/material-color-utilities/dynamiccolor/dynamic_scheme.js');
    const {Variant} = await import('./node_modules/@material/material-color-utilities/dynamiccolor/variant.js');
    const {argbFromHex, hexFromArgb} = await import('./node_modules/@material/material-color-utilities/utils/string_utils.js');
    const output = [];
    for (const seed of ['#e2b62e','#6750a4','#0055cc','#000000']) {
      for (const [name, variant] of [['expressive',Variant.EXPRESSIVE],['tonalSpot',Variant.TONAL_SPOT]]) {
        const result = generate(seed,name);
        for (const [mode, dark] of [['bright',false],['dark',true]]) {
          const ref = new DynamicScheme({sourceColorHct:Hct.fromInt(argbFromHex(seed)),variant,isDark:dark,contrastLevel:0,specVersion:'2021',platform:'phone'});
          output.push({actual:result[mode].primary, expected:hexFromArgb(ref.primary), actualTertiary:result[mode].tertiary, expectedTertiary:hexFromArgb(ref.tertiary), minimal:result.minimal});
        }
      }
    }
    for (const args of [['bad','expressive'],['#123456','other']]) { try { generate(...args); process.exit(2); } catch (_) {} }
    console.log(JSON.stringify(output));`;
  const samples = JSON.parse(execFileSync(process.execPath, ['--input-type=module','-e',source], {encoding:'utf8',cwd:require('node:path').resolve(__dirname,'..')}));
  for (const sample of samples) {
    assert.equal(sample.actual,sample.expected);
    assert.equal(sample.actualTertiary,sample.expectedTertiary);
    assert.match(sample.minimal.surface,/^#[0-9a-f]{6}$/);
    assert.equal(sample.minimal.onPrimary,sample.minimal.surface);
  }
});
