// Build-time Material You tokens. No color library is required by the browser.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

// The upstream 0.4.0 package contains bundler-style extensionless ESM imports.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier))
      specifier += ".js";
    return next(specifier, context);
  },
});
const packageBase = process.env.MATERIAL_COLOR_UTILITIES_PATH
  ? pathToFileURL(
      process.env.MATERIAL_COLOR_UTILITIES_PATH.replace(/\/$/, "") + "/",
    )
  : new URL(
      "../node_modules/@material/material-color-utilities/",
      import.meta.url,
    );
const { Hct } = await import(new URL("hct/hct.js", packageBase));
const { DynamicScheme } = await import(
  new URL("dynamiccolor/dynamic_scheme.js", packageBase)
);
const { Variant } = await import(
  new URL("dynamiccolor/variant.js", packageBase)
);
const { argbFromHex, hexFromArgb } = await import(
  new URL("utils/string_utils.js", packageBase)
);
const source = "#e2b62e";
const roleNames = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "surface",
  "onSurface",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "surfaceVariant",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
  "surfaceTint",
  "scrim",
  "shadow",
];
const scheme = (isDark, variant = Variant.TONAL_SPOT) =>
  new DynamicScheme({
    sourceColorHct: Hct.fromInt(argbFromHex(source)),
    variant,
    isDark,
    contrastLevel: 0,
    specVersion: "2021",
    platform: "phone",
  });
const bright = scheme(false),
  dark = scheme(true),
  mono = scheme(true, Variant.MONOCHROME);
const roles = (value) =>
  Object.fromEntries(roleNames.map((name) => [name, hexFromArgb(value[name])]));
const themes = {
  bright: roles(bright),
  dark: roles(dark),
  minimal: roles(mono),
};
themes.minimal.surface = hexFromArgb(mono.neutralPalette.tone(2));
for (const [name, tone] of [
  ["surfaceContainerLowest", 2],
  ["surfaceContainerLow", 5],
  ["surfaceContainer", 7],
  ["surfaceContainerHigh", 9],
  ["surfaceContainerHighest", 11],
  ["onSurface", 68],
  ["onSurfaceVariant", 56],
  ["outlineVariant", 22],
  ["outline", 35],
])
  themes.minimal[name] = hexFromArgb(mono.neutralPalette.tone(tone));
themes.minimal.primary = hexFromArgb(dark.primaryPalette.tone(72));
themes.minimal.onPrimary = themes.minimal.surface;
const output = {
  source,
  library: "@material/material-color-utilities@0.4.0",
  specVersion: "2021",
  variant: "TONAL_SPOT",
  contrastLevel: 0,
  minimal: "MONOCHROME neutral tones plus primary tone 72 control outlines",
  themes,
};
await writeFile(
  new URL("../themes/material-tokens.json", import.meta.url),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  "Generated bright, dark and minimal Material You tokens. Rebuild the HTML to apply them.",
);
