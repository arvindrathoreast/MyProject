import { test, expect } from '@playwright/test';

import { urlFor } from '../utils/routes';

test('visual snapshot of homepage', async ({ page }: { page: any }) => {
  await page.goto(urlFor(0));
  await expect(page).toHaveScreenshot('homepage.png', { fullPage: true });
});
