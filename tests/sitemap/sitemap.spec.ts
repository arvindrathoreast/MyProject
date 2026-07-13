import { test, expect } from '@playwright/test';

import { baseUrl as routesBaseUrl } from '../utils/routes';

test.describe('Sitemap validation', () => {
  const BASE = process.env.BASE_URL || routesBaseUrl();

  test('sitemap.xml exists and is valid XML', async ({ request }) => {
    const url = new URL('/sitemap.xml', BASE).toString();
    const res = await request.get(url);
    expect(res.ok(), `Failed to fetch sitemap at ${url} (status ${res.status()})`).toBeTruthy();

    const text = await res.text();
    // Basic checks: contains XML prolog or root urlset tag
    expect(
      /<\?xml\s+/i.test(text) || /<urlset[\s>]/i.test(text),
      `sitemap.xml does not appear to be XML: ${url}`,
    ).toBeTruthy();

    // Extract <loc> entries via simple regex (works for common sitemap formats)
    const locRegex = /<loc>([^<]+)<\/loc>/gi;
    const locs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = locRegex.exec(text)) !== null) {
      locs.push(m[1].trim());
    }

    expect(locs.length, `No <loc> entries found in sitemap.xml at ${url}`).toBeGreaterThan(0);

    // Sample up to N URLs and ensure they return 200
    const SAMPLE = Math.min(5, locs.length);
    for (let i = 0; i < SAMPLE; i++) {
      const loc = locs[i];
      // Skip entries that are clearly non-HTTP
      if (!/^https?:\/\//i.test(loc)) continue;
      const r = await request.get(loc);
      expect(r.status(), `Sitemap entry ${loc} did not return 200`).toBe(200);
    }
  });
});
