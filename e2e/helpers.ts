import type { Locator, Page } from '@playwright/test';

/**
 * Navigate and wait until every Astro island has hydrated (the `ssr`
 * attribute is removed on hydration). Astro server-renders islands, so
 * buttons exist — and silently ignore clicks — before hydration.
 */
export async function gotoLesson(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('astro-island')].every((island) => !island.hasAttribute('ssr')),
  );
}

/**
 * Seed ta:progress before any page script runs. Matches the v2 Progress
 * shape in src/stores/progress.ts.
 */
export async function seedProgress(
  page: Page,
  overrides: { settings?: Partial<{ motion: string; sfx: boolean; renderer: string }> } = {},
): Promise<void> {
  const progress = {
    version: 2,
    tool: null,
    completedLevels: [],
    xp: 0,
    badges: [],
    hintsUsed: {},
    settings: { motion: 'full', sfx: false, renderer: 'game', ...overrides.settings },
  };
  await page.addInitScript((value) => {
    localStorage.setItem('ta:progress', value);
  }, JSON.stringify(progress));
}

/**
 * Pointer drag that satisfies dnd-kit's PointerSensor (4px activation):
 * down on source center, step to target center, up.
 */
export async function dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag endpoints not visible');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 }); // pass activation distance
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  // dnd-kit installs a short-lived capture-phase click suppressor on the
  // document after every drag; a click fired immediately after mouse.up is
  // swallowed. Let it expire before the test clicks anything.
  await page.waitForTimeout(300);
}

/**
 * dragTo with a postcondition — retries once if layout reflow between
 * boundingBox reads made the first attempt grab thin air.
 */
export async function dragUntil(
  page: Page,
  source: Locator,
  target: Locator,
  landed: Locator,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await dragTo(page, source, target);
    if ((await landed.count()) > 0) return;
  }
  throw new Error('drag did not land after two attempts');
}

/**
 * Keyboard drag via dnd-kit's KeyboardSensor: Enter picks up, arrows move
 * 25px per press, Enter drops. Deterministic and viewport-independent-ish.
 */
export async function keyboardDrag(
  page: Page,
  source: Locator,
  moves: { key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'; presses: number }[],
): Promise<void> {
  await source.focus();
  await page.keyboard.press('Enter');
  for (const move of moves) {
    for (let i = 0; i < move.presses; i++) {
      await page.keyboard.press(move.key);
    }
  }
  await page.keyboard.press('Enter');
}
