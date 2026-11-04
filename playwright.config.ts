import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// e2e runs the real app on 127.0.0.1:7413 with a throwaway BRIDGE_HOME (models reused from ~/.bridge/models).
const home = mkdtempSync(join(tmpdir(), 'bridge-e2e-'));
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:7413', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npx --no-install vite build --config web/vite.config.ts --logLevel warn && npx --no-install tsx src/server/main.ts',
    url: 'http://127.0.0.1:7413/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BRIDGE_PORT: '7413', BRIDGE_HOME: home, BRIDGE_MODELS: process.env.BRIDGE_MODELS ?? join(homedir(), '.bridge', 'models'), BRIDGE_KEYSTORE: 'file', BRIDGE_OCR: 'off' },
  },
});
