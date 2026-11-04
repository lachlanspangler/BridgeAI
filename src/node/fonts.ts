/** Register the design system's fonts (OFL, from @fontsource) with the Node canvas, once. */
import { GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { FONT_FILES } from '../core/design/tokens.ts';

let done = false;

export function fontsourceRoot(): string {
  const require = createRequire(import.meta.url);
  // resolve any file in @fontsource/inter, then go up to node_modules/@fontsource
  return dirname(dirname(require.resolve('@fontsource/inter/package.json')));
}

export function registerFonts(): { family: string; ok: boolean }[] {
  const root = fontsourceRoot();
  const out = FONT_FILES.map((f) => ({
    family: `${f.family} ${f.weight}`,
    ok: !!GlobalFonts.registerFromPath(join(root, f.file), f.family),
  }));
  done = true;
  return out;
}

export function ensureFonts(): void {
  if (!done) registerFonts();
}
