import { defineConfig, devices } from '@playwright/test';

// Try to load routes config for a default baseUrl. Environment variable overrides.
let configBaseUrl: string | undefined = undefined;
try {
  // require JSON (works in Node) — tests run in Node context
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const routesConfig = require('./config/routes.json');
  if (routesConfig && routesConfig.baseUrl) configBaseUrl = routesConfig.baseUrl;
} catch {
  // ignore if config not found
}

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Use a compact console reporter for CI and still produce an HTML report file
  reporter: process.env.GITHUB_ACTIONS
    ? [
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'playwright-report/report.json' }],
      ]
    : [
        ['dot'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'playwright-report/report.json' }],
      ],
  use: {
    actionTimeout: 0,
    trace: 'on-first-retry',
    baseURL: process.env.BASE_URL || configBaseUrl || 'https://example.com',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
