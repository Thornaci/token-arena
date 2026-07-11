import { expect, test } from '@playwright/test';
import { dragTo, gotoLesson, keyboardDrag, seedProgress } from './helpers';

const LESSON = 'en/lessons/03-context-window/l3-1/';

test.beforeEach(async ({ page }) => {
  await seedProgress(page);
});

test('happy path: trim by dragging + compress, then a clean send passes', async ({ page }) => {
  await gotoLesson(page, LESSON);
  const smallTalk = page.getByText("yesterday's small talk").first();
  const tray = page.getByText('trim tray').locator('..');

  await dragTo(page, smallTalk, tray);
  // the block resurfaces struck-through inside the tray
  await expect(tray.getByRole('button', { name: /yesterday's small talk/ })).toBeVisible();

  await page.getByRole('button', { name: /summarize/i }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
});

test('rupture spectacle: over-budget send shows the 400 overlay, skippable, resettable', async ({
  page,
}) => {
  await gotoLesson(page, LESSON);
  await page.getByRole('button', { name: 'Send request' }).click();

  // cinematic in flight → the Skip affordance appears; skipping lands the final state
  await page.getByRole('button', { name: /skip animation/i }).click();
  await expect(page.getByText('400 — prompt is too long')).toBeVisible();

  await page.getByRole('button', { name: /reset/i }).click();
  await expect(page.getByText('400 — prompt is too long')).not.toBeVisible();
});

test('reduced motion: the 400 state appears instantly with no pending animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoLesson(page, LESSON);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('400 — prompt is too long')).toBeVisible();
  await expect(page.getByRole('button', { name: /skip animation/i })).not.toBeVisible();
});

test('keyboard drag: a block moves to the tray without a pointer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'desktop keyboard flow');
  await gotoLesson(page, LESSON);
  const smallTalk = page
    .getByRole('button', { name: /yesterday's small talk/ })
    .first();
  const tray = page.getByText('trim tray').locator('..');
  const trayBox = (await tray.boundingBox())!;
  const sourceBox = (await smallTalk.boundingBox())!;
  const dx = trayBox.x + trayBox.width / 2 - (sourceBox.x + sourceBox.width / 2);
  const dy = trayBox.y + trayBox.height / 2 - (sourceBox.y + sourceBox.height / 2);
  await keyboardDrag(page, smallTalk, [
    { key: dx > 0 ? 'ArrowRight' : 'ArrowLeft', presses: Math.ceil(Math.abs(dx) / 25) },
    { key: dy > 0 ? 'ArrowDown' : 'ArrowUp', presses: Math.ceil(Math.abs(dy) / 25) },
  ]);
  await expect(tray.getByRole('button', { name: /yesterday's small talk/ })).toBeVisible();
});

test('drop targets meet the 44px minimum', async ({ page }) => {
  await gotoLesson(page, LESSON);
  for (const draggable of await page.locator('[aria-roledescription="draggable"]').all()) {
    const box = await draggable.boundingBox();
    expect(box, 'draggable must be visible').toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(43); // sub-pixel rounding slack
    expect(box!.width).toBeGreaterThanOrEqual(43);
  }
});

test('output-reserve: ± buttons change the reserve and a correct reserve passes', async ({
  page,
}) => {
  await gotoLesson(page, 'en/lessons/03-context-window/l3-2/');
  // 128 start → need ≥1200; click until the displayed reserve says so
  // (value-driven, so a click lost to a busy renderer can't flake the test)
  const plus = page.getByRole('button', { name: '+ 64' });
  const reserve = page.locator('span.min-w-20');
  for (let i = 0; i < 25; i++) {
    const value = Number((await reserve.textContent())!.replace(/[^0-9]/g, ''));
    if (value >= 1200) break;
    await plus.click();
  }
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
});
