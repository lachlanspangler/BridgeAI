/**
 * Screenshots of the real app (Playwright) → artifacts/ux/<label>/. Needs Bridge running (make dev).
 *   npx tsx scripts/shoot.ts [label] [--job j_xxx]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const label = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'latest';
const job = process.argv.includes('--job') ? process.argv[process.argv.indexOf('--job') + 1] : undefined;
const base = process.env.BRIDGE_URL ?? 'http://127.0.0.1:7411';
const out = join('artifacts/ux', label);
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [name, w, h] of [['desktop', 1366, 900], ['mobile', 390, 844]] as const) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`${base}/#/`);
  await p.waitForSelector('textarea');
  await p.screenshot({ path: join(out, `${name}-create.png`), fullPage: true });
  await p.goto(`${base}/#/settings`);
  await p.waitForSelector('.key-row');
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(out, `${name}-settings.png`), fullPage: true });
  await p.goto(`${base}/#/library`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(out, `${name}-library.png`), fullPage: true });
  if (job) {
    await p.goto(`${base}/#/job/${job}`);
    await p.waitForSelector('video');
    await p.waitForTimeout(800);
    await p.screenshot({ path: join(out, `${name}-watch.png`), fullPage: true });
  }
  await p.close();
}
await b.close();
console.log(out);
