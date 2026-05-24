import { defineConfig, devices } from '@playwright/test';

// Playwright config — targets the Astro dev/preview server.
//
// In CI we build first (npm run build) then serve via `npm run preview`
// so the test exercises the static-built artifact (which is what users
// load from GitHub Pages / chepherd.org). Locally `npm run dev` works.

const PORT = Number(process.env['PORT'] ?? 4321);
const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? `http://localhost:${PORT}`;
const IS_CI = !!process.env['CI'];

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  ...(IS_CI ? { workers: 1 } : {}),
  reporter: IS_CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    colorScheme: 'dark',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env['PLAYWRIGHT_NO_SERVER']
    ? undefined
    : {
        command: IS_CI ? 'npm run build && npm run preview -- --port 4321' : 'npm run dev -- --port 4321',
        url: BASE_URL,
        reuseExistingServer: !IS_CI,
        timeout: 120_000,
      },
});
