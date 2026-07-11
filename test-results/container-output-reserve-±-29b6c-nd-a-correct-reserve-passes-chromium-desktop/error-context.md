# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: container.spec.ts >> output-reserve: ± buttons change the reserve and a correct reserve passes
- Location: e2e/container.spec.ts:76:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('LEVEL CLEAR')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('LEVEL CLEAR')

```

```yaml
- banner:
  - link "← Token_Arena":
    - /url: /token-arena/en/
  - paragraph: ▲ 0 XP 0/20
  - button "settings": ⚙
  - navigation "Language":
    - text: EN
    - link "TR":
      - /url: /token-arena/tr/lessons/03-context-window/l3-2/
- main:
  - paragraph: L3.2
  - heading "Reserve room for the answer" [level=1]
  - paragraph: "Input and output share the window. max_tokens is a hard reservation: too small truncates the answer, too large gets the whole request rejected."
  - paragraph: "Task: “Write the full refactor plan for the payments module — roughly 1,200 tokens of plan.” Input is fixed at 6,000 tokens. Set the output reserve, then send."
  - 'figure "window: 8,000 tokens"':
    - group "context window vessel":
      - text: reserved for the answer · 1,152
      - button "⇕"
      - text: "SYS system prompt: senior reviewer 500 USR payments module source (attached) 5500"
    - text: "window: 8,000 tokens"
  - paragraph: Drag the ⇕ handle on the hatched zone (or use the buttons) to change how much of the window is saved for the reply.
  - button "− 64": −
  - text: 1,152
  - button "+ 64": +
  - paragraph: "input blocks: 6,000 tokens — input and output share one window"
  - button "Send request"
  - paragraph: REFACTOR PLAN — payments module. 1) Extract the retry queue into
  - paragraph: ⚠ generation stopped at 1,152 tokens — the reserve ran out mid-answer
  - status
  - paragraph: generation stopped at 1,152 tokens — the reserve ran out mid-answer
  - button "↺ reset"
  - region "Hints":
    - button "Stuck? Reveal a hint"
- complementary:
  - region "the model":
    - img "overwhelmed — context nearly full"
    - paragraph: the model · overwhelmed — context nearly full
    - button "20 20 confusion ▸":
      - meter "confusion meter, 0 to 100"
      - text: 20 confusion ▸
  - region "Context Inspector":
    - button "Context Inspector 7,152 / 8,000" [expanded]
    - text: Model Generic (8K)
    - meter "Context window fill"
    - text: "window nearly full reserved for answer: 1,152"
    - term: system
    - definition: "500"
    - term: files
    - definition: 5,500
    - term: reserved output
    - definition: 1,152
    - list:
      - listitem:
        - text: 0 SYS 500
        - paragraph: "system prompt: senior reviewer"
      - listitem:
        - text: 1 USR 🗎 5,500
        - paragraph: payments module source (attached)
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { dragTo, gotoLesson, keyboardDrag, seedProgress } from './helpers';
  3  | 
  4  | const LESSON = 'en/lessons/03-context-window/l3-1/';
  5  | 
  6  | test.beforeEach(async ({ page }) => {
  7  |   await seedProgress(page);
  8  | });
  9  | 
  10 | test('happy path: trim by dragging + compress, then a clean send passes', async ({ page }) => {
  11 |   await gotoLesson(page, LESSON);
  12 |   const smallTalk = page.getByText("yesterday's small talk").first();
  13 |   const tray = page.getByText('trim tray').locator('..');
  14 | 
  15 |   await dragTo(page, smallTalk, tray);
  16 |   // the block resurfaces struck-through inside the tray
  17 |   await expect(tray.getByRole('button', { name: /yesterday's small talk/ })).toBeVisible();
  18 | 
  19 |   await page.getByRole('button', { name: /summarize/i }).click();
  20 |   await page.getByRole('button', { name: 'Send request' }).click();
  21 |   await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
  22 | });
  23 | 
  24 | test('rupture spectacle: over-budget send shows the 400 overlay, skippable, resettable', async ({
  25 |   page,
  26 | }) => {
  27 |   await gotoLesson(page, LESSON);
  28 |   await page.getByRole('button', { name: 'Send request' }).click();
  29 | 
  30 |   // cinematic in flight → the Skip affordance appears; skipping lands the final state
  31 |   await page.getByRole('button', { name: /skip animation/i }).click();
  32 |   await expect(page.getByText('400 — prompt is too long')).toBeVisible();
  33 | 
  34 |   await page.getByRole('button', { name: /reset/i }).click();
  35 |   await expect(page.getByText('400 — prompt is too long')).not.toBeVisible();
  36 | });
  37 | 
  38 | test('reduced motion: the 400 state appears instantly with no pending animation', async ({
  39 |   page,
  40 | }) => {
  41 |   await page.emulateMedia({ reducedMotion: 'reduce' });
  42 |   await gotoLesson(page, LESSON);
  43 |   await page.getByRole('button', { name: 'Send request' }).click();
  44 |   await expect(page.getByText('400 — prompt is too long')).toBeVisible();
  45 |   await expect(page.getByRole('button', { name: /skip animation/i })).not.toBeVisible();
  46 | });
  47 | 
  48 | test('keyboard drag: a block moves to the tray without a pointer', async ({ page }, testInfo) => {
  49 |   test.skip(testInfo.project.name === 'chromium-mobile', 'desktop keyboard flow');
  50 |   await gotoLesson(page, LESSON);
  51 |   const smallTalk = page
  52 |     .getByRole('button', { name: /yesterday's small talk/ })
  53 |     .first();
  54 |   const tray = page.getByText('trim tray').locator('..');
  55 |   const trayBox = (await tray.boundingBox())!;
  56 |   const sourceBox = (await smallTalk.boundingBox())!;
  57 |   const dx = trayBox.x + trayBox.width / 2 - (sourceBox.x + sourceBox.width / 2);
  58 |   const dy = trayBox.y + trayBox.height / 2 - (sourceBox.y + sourceBox.height / 2);
  59 |   await keyboardDrag(page, smallTalk, [
  60 |     { key: dx > 0 ? 'ArrowRight' : 'ArrowLeft', presses: Math.ceil(Math.abs(dx) / 25) },
  61 |     { key: dy > 0 ? 'ArrowDown' : 'ArrowUp', presses: Math.ceil(Math.abs(dy) / 25) },
  62 |   ]);
  63 |   await expect(tray.getByRole('button', { name: /yesterday's small talk/ })).toBeVisible();
  64 | });
  65 | 
  66 | test('drop targets meet the 44px minimum', async ({ page }) => {
  67 |   await gotoLesson(page, LESSON);
  68 |   for (const draggable of await page.locator('[aria-roledescription="draggable"]').all()) {
  69 |     const box = await draggable.boundingBox();
  70 |     expect(box, 'draggable must be visible').toBeTruthy();
  71 |     expect(box!.height).toBeGreaterThanOrEqual(43); // sub-pixel rounding slack
  72 |     expect(box!.width).toBeGreaterThanOrEqual(43);
  73 |   }
  74 | });
  75 | 
  76 | test('output-reserve: ± buttons change the reserve and a correct reserve passes', async ({
  77 |   page,
  78 | }) => {
  79 |   await gotoLesson(page, 'en/lessons/03-context-window/l3-2/');
  80 |   // 128 start → need ≥1200: 17 × +64
  81 |   const plus = page.getByRole('button', { name: '+ 64' });
  82 |   for (let i = 0; i < 17; i++) await plus.click();
  83 |   await page.getByRole('button', { name: 'Send request' }).click();
> 84 |   await expect(page.getByText('LEVEL CLEAR')).toBeVisible();
     |                                               ^ Error: expect(locator).toBeVisible() failed
  85 | });
  86 | 
```