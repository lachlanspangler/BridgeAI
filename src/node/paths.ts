/** Where Bridge keeps things on the user's machine. Override the root with BRIDGE_HOME. Never inside the repo. */
import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function bridgeHome(): string {
  return process.env.BRIDGE_HOME ?? join(homedir(), '.bridge');
}

export const paths: Record<
  'home' | 'models' | 'hf' | 'llm' | 'jobs' | 'secrets' | 'config' | 'logs',
  () => string
> = {
  home: () => bridgeHome(),
  /** Models can live apart from the rest (BRIDGE_MODELS), e.g. so tests with a temp home reuse downloads. */
  models: () => process.env.BRIDGE_MODELS ?? join(bridgeHome(), 'models'),
  hf: () => join(paths.models(), 'hf'),
  llm: () => join(paths.models(), 'llm'),
  jobs: () => join(bridgeHome(), 'jobs'),
  secrets: () => join(bridgeHome(), 'secrets'),
  config: () => join(bridgeHome(), 'config.json'),
  logs: () => join(bridgeHome(), 'logs'),
};

export function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}

/** ~/.bridge holds your uploads and videos: owner-only. */
export function secureHome(): void {
  mkdirSync(bridgeHome(), { recursive: true, mode: 0o700 });
  try {
    chmodSync(bridgeHome(), 0o700);
  } catch {
    /* windows */
  }
}
