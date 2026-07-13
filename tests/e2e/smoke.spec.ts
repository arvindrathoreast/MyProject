import { test, expect } from '@playwright/test';

import { allRoutes, urlFor } from '../utils/routes';

const routes = allRoutes();

test.describe('smoke: e2e routes', () => {
  for (let i = 0; i < routes.length; i++) {
    const path = routes[i];
    test(`route ${path} @smoke responds and has body`, async ({ page }: { page: any }) => {
      const url = urlFor(i);
      const response = await page.goto(url);
      expect(response && response.ok()).toBeTruthy();
      await expect(page.locator('body')).toBeVisible();
    });
  }
});
