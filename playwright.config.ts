import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 3,
  timeout: 90_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173/chessdoku/',
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --base=/chessdoku/',
    url: 'http://127.0.0.1:4173/chessdoku/',
    reuseExistingServer: !process.env.CI,
  },
});
