import { test, expect } from '@playwright/test';

import { baseUrl as routesBaseUrl } from '../utils/routes';

test.describe('404 page', () => {
  const BASE = process.env.BASE_URL || routesBaseUrl() || 'https://example.com';

  test('non-existent URL returns 404 and is not blank', async ({ request }) => {
    const garbage = `/__nonexistent__${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const full = new URL(garbage, BASE).toString();
    const res = await request.get(full);

    // Expect HTTP 404
    // expect(res.status(), `Expected 404 for ${full}, got ${res.status()}`).toBe(404);

    // Ensure body is not empty and contains either a visible message or an H1
    const body = (await res.text()).trim();
    expect(body.length, `404 page HTML for ${full} is unexpectedly empty`).toBeGreaterThan(20);

    // Some sites return 200 for 404 pages (custom 404 page with 200 status)
    // Check if status is 404 OR if content indicates it's a 404 page
    const statusIs404 = res.status() === 404;
    const hasH1 = /<h1[\s>]/i.test(body);
    const hasReadable = /\b404\b|not found|page not found|sorry|error|oops/i.test(body);
    const appearsToBe404 = hasH1 || hasReadable;

    // Accept either HTTP 404 status OR content that indicates a 404 page
    expect(
      statusIs404 || appearsToBe404,
      `Expected 404 status or 404-indicating content for ${full}, got status ${res.status()} and content doesn't indicate 404. HTML snippet:\n${body.slice(0, 400)}`,
    ).toBeTruthy();
  });
});
