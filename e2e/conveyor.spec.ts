import { expect, test } from '@playwright/test';
import { dragUntil, gotoLesson, seedProgress } from './helpers';

test.beforeEach(async ({ page }) => {
  await seedProgress(page);
});

test('L2.1: subset ships → amnesia; everything ships → reflection passes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // skip belt theater
  await gotoLesson(page, 'en/lessons/02-request-loop/l2-1/');

  // three scripted sends
  for (let n = 1; n <= 3; n++) {
    await page.getByRole('button', { name: `Send message ${n}/4` }).click();
  }

  // turn 4: ship only the new message → amnesia
  const belt = page.getByText('conveyor belt', { exact: true }).locator('..').first();
  const newMessage = page.getByRole('button', { name: /new message/ }).first();
  await dragUntil(page, newMessage, belt, belt.getByRole('button', { name: /new message/ }));
  await page.getByRole('button', { name: 'Send message 4/4' }).click();
  await expect(page.getByText(/What file\? What bug\?/).first()).toBeVisible();
  await expect(page.getByText('LEVEL CLEAR')).not.toBeVisible();

  // retry: put EVERYTHING on the belt
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: /new message/ })).toBeVisible();
  for (const name of [/new message/, /concise, friendly/, /turn 1/, /turn 2/, /turn 3/]) {
    const envelope = page.getByRole('button', { name }).first();
    await dragUntil(page, envelope, belt, belt.getByRole('button', { name }));
  }
  await page.getByRole('button', { name: 'Send message 4/4' }).click();

  // graded reflection (unchanged pass): third option is correct
  await page.getByRole('radio').nth(2).check();
  await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
});

test('L2.2: caching stamps the prefix but parcels keep their size', async ({ page }) => {
  await gotoLesson(page, 'en/lessons/02-request-loop/l2-2/');

  const firstParcel = page.locator('ol li span[title]').first();
  const widthBefore = (await firstParcel.boundingBox())!.width;

  await page.getByRole('checkbox', { name: /caching/i }).check();
  await expect(page.getByText('CACHED −90%').first()).toBeVisible();

  // the misconception, encoded: price changes, belt space does not
  const widthAfter = (await firstParcel.boundingBox())!.width;
  expect(Math.abs(widthAfter - widthBefore)).toBeLessThan(2);

  await page.getByRole('radio').nth(1).check();
  await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
});

test('TR smoke: the conveyor renders localized without clipping', async ({ page }) => {
  await gotoLesson(page, 'tr/lessons/02-request-loop/l2-1/');
  await expect(page.getByText('taşıma bandı').first()).toBeVisible();
  // no horizontal page overflow with the longer Turkish strings
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
