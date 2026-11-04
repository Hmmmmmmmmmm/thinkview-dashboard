// Material Color Utilities 0.4.0 (Apache-2.0); this module runs entirely in Studio.
import { Hct } from '../node_modules/@material/material-color-utilities/hct/hct.js';
import { DynamicScheme } from '../node_modules/@material/material-color-utilities/dynamiccolor/dynamic_scheme.js';
import { Variant } from '../node_modules/@material/material-color-utilities/dynamiccolor/variant.js';
import { argbFromHex, hexFromArgb } from '../node_modules/@material/material-color-utilities/utils/string_utils.js';

const roleNames = ['primary','onPrimary','primaryContainer','onPrimaryContainer','secondary','onSecondary','secondaryContainer','onSecondaryContainer','tertiary','onTertiary','tertiaryContainer','onTertiaryContainer','error','onError','errorContainer','onErrorContainer','surface','onSurface','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer','surfaceContainerHigh','surfaceContainerHighest','surfaceVariant','onSurfaceVariant','outline','outlineVariant','inverseSurface','inverseOnSurface','inversePrimary','surfaceTint','scrim','shadow'];
export function generate(seed, variantName = 'expressive') {
  if (!/^#[0-9a-f]{6}$/i.test(seed)) throw Error('Enter a six-digit hex color.');
  const variant = {expressive: Variant.EXPRESSIVE, tonalSpot: Variant.TONAL_SPOT}[variantName];
  if (variant === undefined) throw Error('Unknown color scheme style.');
  const sourceColorHct = Hct.fromInt(argbFromHex(seed));
  const scheme = (isDark, type = variant) => new DynamicScheme({sourceColorHct, variant:type, isDark, contrastLevel:0, specVersion:'2021', platform:'phone'});
  const bright = scheme(false), dark = scheme(true), mono = scheme(true, Variant.MONOCHROME);
  const roles = value => Object.fromEntries(roleNames.map(name => [name, hexFromArgb(value[name])]));
  const themes = {bright:roles(bright), dark:roles(dark), minimal:roles(mono)};
  for (const [name, tone] of [['surface',2],['surfaceContainerLowest',2],['surfaceContainerLow',5],['surfaceContainer',7],['surfaceContainerHigh',9],['surfaceContainerHighest',11],['onSurface',68],['onSurfaceVariant',56],['outlineVariant',22],['outline',35]]) themes.minimal[name] = hexFromArgb(mono.neutralPalette.tone(tone));
  themes.minimal.primary = hexFromArgb(dark.primaryPalette.tone(72));
  themes.minimal.onPrimary = themes.minimal.surface;
  return themes;
}
