import { test } from '@playwright/test';

import { urlFor } from '../utils/routes';
import { checkA11y } from '../utils/axe';

test('basic accessibility smoke test', async ({ page }: { page: any }) => {
  await page.goto(urlFor(0));
  await checkA11y(page);
});
