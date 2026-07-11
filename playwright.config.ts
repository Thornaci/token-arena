import { defineConfig, devices } from '@playwright/test';

/**
 * E2E for the game renderers (spec §6.5): drag happy paths, failure
 * spectacles, skip, reduced motion, classic mode — desktop and mobile.
 * Runs against the production build via `astro preview` (base /token-arena).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321/token-arena/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/token-arena/en/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
