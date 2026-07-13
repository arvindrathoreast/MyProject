import { test } from '@playwright/test';

import { urlFor } from '../utils/routes';
import { checkA11y } from '../utils/axe';

test('a11y smoke - first route @smoke', async ({ page }: { page: any }) => {
  const url = urlFor(0);
  await page.goto(url);
  await checkA11y(page);
});
