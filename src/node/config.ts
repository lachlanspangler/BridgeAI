/** User config at ~/.bridge/config.json (never contains secrets; keys live in the keystore). */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ensureDir, paths } from './paths.ts';

export const Config = z.object({
  llm: z.object({ path: z.string().optional(), id: z.string().optional() }).default({}),
  /** Preferred provider per stage when the user picks "auto" and has keys: e.g. { script: "anthropic" }. */
  defaults: z
    .object({ llm: z.string().default('auto'), tts: z.string().default('auto') })
    .default({ llm: 'auto', tts: 'auto' }),
  models: z.record(z.string(), z.string()).default({}),
});
export type Config = z.infer<typeof Config>;

export function loadConfig(): Config {
  const p = paths.config();
  if (!existsSync(p)) return Config.parse({});
  try {
    return Config.parse(JSON.parse(readFileSync(p, 'utf8')));
  } catch {
    return Config.parse({});
  }
}

export function saveConfig(c: Config): void {
  ensureDir(paths.home());
  writeFileSync(paths.config(), JSON.stringify(Config.parse(c), null, 2));
}
