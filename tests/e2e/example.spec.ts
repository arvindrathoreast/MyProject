import { test, expect } from '@playwright/test';

import { urlFor } from '../utils/routes';

test('homepage has expected title', async ({ page }: { page: any }) => {
  await page.goto(urlFor(0));
  await expect(page).toHaveTitle(/Koch Agronomic Services/i);
});
