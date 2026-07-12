import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoLesson, seedProgress } from './helpers';

/**
 * axe sweep over the game-rendered surfaces (G3 gate). Serious/critical
 * violations fail the build; minor/moderate are reported in the log.
 */

const PAGES = [
  ['container', 'en/lessons/03-context-window/l3-1/'],
  ['corridor', 'en/lessons/05-rot/l5-1/'],
  ['conveyor', 'en/lessons/02-request-loop/l2-1/'],
  ['token scale', 'en/lessons/01-tokens/l1-2/'],
  ['tower', 'en/lessons/04-hierarchy/l4-1/'],
  ['routing', 'en/lessons/04-hierarchy/l4-2/'],
  ['probability wall', 'en/lessons/06-sampling/l6-1/'],
  ['jenga', 'en/lessons/07-ecosystem/l7-3/'],
] as const;

for (const [name, path] of PAGES) {
  test(`axe: ${name} game scene has no serious violations`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'desktop sweep is representative');
    await seedProgress(page);
    await gotoLesson(page, path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    const minor = results.violations.filter(
      (violation) => !['serious', 'critical'].includes(violation.impact ?? ''),
    );
    if (minor.length > 0) {
      console.log(
        `${name}: ${minor.length} minor/moderate finding(s):`,
        minor.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`).join(', '),
      );
    }
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    ).toEqual([]);
  });
}
