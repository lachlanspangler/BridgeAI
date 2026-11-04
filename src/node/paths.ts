/** Where Bridge keeps things on the user's machine. Override the root with BRIDGE_HOME. Never inside the repo. */
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function bridgeHome(): string {
  return process.env.BRIDGE_HOME ?? join(homedir(), '.bridge');
}

export const paths = {
  home: () => bridgeHome(),
  models: () => join(bridgeHome(), 'models'),
  hf: () => join(bridgeHome(), 'models', 'hf'),
  llm: () => join(bridgeHome(), 'models', 'llm'),
  jobs: () => join(bridgeHome(), 'jobs'),
  secrets: () => join(bridgeHome(), 'secrets'),
  config: () => join(bridgeHome(), 'config.json'),
  logs: () => join(bridgeHome(), 'logs'),
};

export function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}
