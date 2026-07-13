import { test, expect } from '@playwright/test';

import { urlFor } from '../utils/routes';

test('perf smoke - load time under threshold (20s) @smoke', async ({ page }: { page: any }) => {
  const url = urlFor(0);
  await page.goto(url);
  const loadTime = await page.evaluate(() => {
    // Use NavigationTiming where available (cast to any for browser runtime access)
    const t = (performance as any).timing;
    if (t && t.loadEventEnd && t.navigationStart) return t.loadEventEnd - t.navigationStart;
    // fallback to performance.now() if navigation timing not available
    return typeof (performance as any).now === 'function' ? (performance as any).now() : 0;
  });

  // Log the measured value so it's easy to inspect in CI logs
  console.log('smoke perf loadTime (ms):', loadTime);
  expect(loadTime).toBeGreaterThanOrEqual(0);
  expect(loadTime).toBeLessThan(20000);
});
