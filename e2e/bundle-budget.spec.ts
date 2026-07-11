import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test, type Browser } from '@playwright/test';

/**
 * Spec §6.3 budget: a game-rendered lesson page may load at most 60KB more
 * gzipped JS than its classic rendering. Measured at runtime (chunks the
 * browser actually fetches), gzipped from dist/ — resistant to chunk-name
 * churn and honest about lazy loading.
 */

const LESSON = 'en/lessons/03-context-window/l3-1/';

async function loadedJs(browser: Browser, renderer: 'game' | 'classic'): Promise<Set<string>> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const files = new Set<string>();
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith('.js')) files.add(pathname);
  });
  const progress = {
    version: 2,
    tool: null,
    completedLevels: [],
    xp: 0,
    badges: [],
    hintsUsed: {},
    settings: { motion: 'full', sfx: false, renderer },
  };
  await page.addInitScript((value) => {
    localStorage.setItem('ta:progress', value);
  }, JSON.stringify(progress));
  await page.goto(LESSON);
  await page.waitForLoadState('networkidle');
  await context.close();
  return files;
}

test('game renderer adds ≤60KB gzipped JS over classic on L3.1', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'same numbers on mobile');
  const game = await loadedJs(browser, 'game');
  const classic = await loadedJs(browser, 'classic');
  const added = [...game].filter((file) => !classic.has(file));

  let totalGz = 0;
  const breakdown: string[] = [];
  for (const file of added) {
    const rel = file.replace(/^\/token-arena\//, '');
    const gz = gzipSync(readFileSync(path.join('dist', rel))).length;
    totalGz += gz;
    breakdown.push(`${rel}: ${(gz / 1024).toFixed(1)}KB gz`);
  }
  testInfo.annotations.push({ type: 'bundle-budget', description: breakdown.join(', ') || 'no delta' });
  console.log(`game-over-classic delta: ${(totalGz / 1024).toFixed(1)}KB gz\n  ${breakdown.join('\n  ')}`);
  expect(totalGz).toBeLessThanOrEqual(60 * 1024);
});
