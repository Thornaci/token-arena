import { expect, test } from '@playwright/test';
import { dragTo, gotoLesson, seedProgress } from './helpers';

const LESSON = 'en/lessons/05-rot/l5-1/';

test.beforeEach(async ({ page }) => {
  await seedProgress(page);
});

test('needle in the fog misses; needle at the end retrieves and passes', async ({ page }) => {
  await gotoLesson(page, LESSON);
  const needle = page.locator('[aria-roledescription="draggable"]').first();

  // 1) drop it mid-corridor → the beam loses it
  const slots = page.locator('div[class*="-translate-x-1/2"]');
  await dragTo(page, needle, slots.nth(2));
  await page.getByRole('button', { name: 'retrieve' }).click();
  // the beam is skippable while it sweeps; if it already finished, fine
  await page
    .getByRole('button', { name: /skip animation/i })
    .click({ timeout: 2000 })
    .catch(() => {});
  await expect(page.getByText(/don't see a specific date/).first()).toBeVisible();
  await expect(page.getByText('LEVEL CLEAR')).not.toBeVisible();

  // 2) move it to the lit end → crisp lock, level clear
  const placedNeedle = page.locator('[aria-roledescription="draggable"]').first();
  await dragTo(page, placedNeedle, slots.nth(4));
  await page.getByRole('button', { name: 'retrieve' }).click();
  await page
    .getByRole('button', { name: /skip animation/i })
    .click({ timeout: 2000 })
    .catch(() => {});
  await expect(page.getByText(/retrieved/).first()).toBeVisible();
  await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
});

test('reduced motion: retrieval verdict lands instantly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoLesson(page, LESSON);
  const needle = page.locator('[aria-roledescription="draggable"]').first();
  const slots = page.locator('div[class*="-translate-x-1/2"]');
  await dragTo(page, needle, slots.nth(0));
  await page.getByRole('button', { name: 'retrieve' }).click();
  await expect(page.getByText(/retrieved/).first()).toBeVisible();
  await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
});

test('length mode (L5.2): grow filler, probe twice, commit the lean context', async ({ page }) => {
  await gotoLesson(page, 'en/lessons/05-rot/l5-2/');
  await page.getByRole('button', { name: 'retrieve' }).click();
  await page
    .getByRole('button', { name: /skip animation/i })
    .click({ timeout: 2000 })
    .catch(() => {});
  await expect(page.getByText(/Retrieved cleanly/).first()).toBeVisible();

  await page.getByRole('button', { name: '+ add filler' }).click();
  await page.getByRole('button', { name: '+ add filler' }).click();
  await page.getByRole('button', { name: '+ add filler' }).click();
  await page.getByRole('button', { name: 'retrieve' }).click();
  await page
    .getByRole('button', { name: /skip animation/i })
    .click({ timeout: 2000 })
    .catch(() => {});
  await expect(page.getByText(/Missed —/).first()).toBeVisible();

  // reflection step appears after ≥2 probes; the lean option is the answer
  const lean = page.getByRole('radio').first();
  await lean.check();
  await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
});
