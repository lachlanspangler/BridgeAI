/** `make dev`: build the web app, then start Bridge on 127.0.0.1 (one process, port BRIDGE_PORT or 7411). */
import { spawnSync } from 'node:child_process';
const b = spawnSync(
  'npx',
  ['--no-install', 'vite', 'build', '--config', 'web/vite.config.ts', '--logLevel', 'warn'],
  { stdio: 'inherit' },
);
if (b.status !== 0) process.exit(b.status ?? 1);
const { start } = await import('../src/server/main.ts');
start();
