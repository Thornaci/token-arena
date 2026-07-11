import { expect, test } from '@playwright/test';
import { gotoLesson, seedProgress } from './helpers';

const LESSON = 'en/lessons/03-context-window/l3-1/';

test('classic mode forces the classic renderer and persists', async ({ page }) => {
  await seedProgress(page, { settings: { renderer: 'classic' } });
  await gotoLesson(page, LESSON);
  // classic WindowFit has per-block Remove buttons; the game tray is absent
  await expect(page.getByRole('button', { name: /remove/i }).first()).toBeVisible();
  await expect(page.getByText('trim tray')).not.toBeVisible();
});

test('toggling Classic mode in the settings popover swaps the renderer live', async ({ page }) => {
  // no seedProgress here: addInitScript re-runs on reload and would overwrite
  // the setting this test writes through the UI
  await gotoLesson(page, LESSON);
  await expect(page.getByText('trim tray')).toBeVisible();

  await page.getByRole('button', { name: 'settings' }).click();
  await page.getByRole('checkbox', { name: 'Classic mode' }).check();
  await expect(page.getByText('trim tray')).not.toBeVisible();
  await expect(page.getByRole('button', { name: /remove/i }).first()).toBeVisible();

  // persists across reload
  await page.reload();
  await expect(page.getByRole('button', { name: /remove/i }).first()).toBeVisible();
  await expect(page.getByText('trim tray')).not.toBeVisible();
});

test('the app-level reduced-motion setting stills CSS keyframes', async ({ page }) => {
  await seedProgress(page, { settings: { motion: 'reduced' } });
  await gotoLesson(page, LESSON);
  await expect(page.locator('html')).toHaveAttribute('data-ta-motion', 'reduced');
});
