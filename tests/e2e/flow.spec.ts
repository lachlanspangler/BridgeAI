import { expect, test } from '@playwright/test';

test('paste → key ideas → 20 s → render → watch with source map and downloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('short, colourful video');
  await expect(page.getByRole('note')).toContainText("don't paste confidential work content");
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Find the key ideas/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Attention Is All You Need');
  await page.getByRole('radio', { name: /20 s/ }).click();
  await page.getByLabel('Script engine').selectOption('extractive');
  await page.getByRole('button', { name: /Show me the key ideas/ }).click();
  await expect(page.locator('.idea').first()).toContainText('Transformer');
  await expect(page.locator('.idea.in')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/ux/e2e/review.png', fullPage: true });
  await page.getByRole('button', { name: /Make my 20-second video/ }).click();
  await expect(page.locator('.stages')).toBeVisible();
  await expect(page.getByTestId('video')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText('every claim traced to the source')).toBeVisible();
  const src = await page.getByTestId('video').getAttribute('src');
  const head = await page.request.get(src!, { headers: { range: 'bytes=0-99' } });
  expect(head.status()).toBe(206);
  await page.locator('.beat-btn').first().click();
  await expect(page.locator('.claim').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/ux/e2e/watch.png', fullPage: true });
  await page.goto('/#/library');
  await expect(page.locator('.lib-item')).toHaveCount(1);
});

test('settings shows keys as optional and never echoes a saved key', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText('Bridge is free with zero keys')).toBeVisible();
  const key = ['sk-or-', 'v1-', 'e2e0123456789abcdef0123456789abcdef'].join('');
  await page.getByLabel('OpenRouter API key').fill(key);
  await page.locator('.key-row').first().getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.key-row').first()).toContainText('connected');
  expect(await page.content()).not.toContain(key);
  await page.locator('.key-row').first().getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with OpenRouter' })).toBeVisible();
});

test('a cross-site page cannot drive the API', async ({ request }) => {
  const r = await request.post('/api/sources', {
    data: { text: 'hello there friend' },
    headers: { origin: 'https://evil.example' },
  });
  expect(r.status()).toBe(403);
});
