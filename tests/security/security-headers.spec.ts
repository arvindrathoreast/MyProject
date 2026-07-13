import { test, expect } from '@playwright/test';

import { allRoutes, baseUrl as routesBaseUrl } from '../utils/routes';

test.describe('Security header sanity checks', () => {
  const BASE = process.env.BASE_URL || routesBaseUrl() || 'https://example.com';
  const routes = allRoutes();

  // limit the number of routes checked to keep test fast
  const SAMPLE = Math.min(routes.length, 5);

  for (let i = 0; i < SAMPLE; i++) {
    const route = routes[i];
    test(`security headers: ${route}`, async ({ request }) => {
      const url = new URL(route.startsWith('/') ? route : `/${route}`, BASE).toString();
      const res = await request.get(url);
      expect(res.ok(), `Failed to fetch ${url}`).toBeTruthy();

      const headers = res.headers();

      // HSTS: only enforce for HTTPS sites
      if (url.startsWith('https://')) {
        const hsts = headers['strict-transport-security'] || headers['Strict-Transport-Security'];
        expect(hsts, `Missing Strict-Transport-Security header on ${url}`).toBeTruthy();
        if (hsts) {
          expect(
            /max-age=\d+/i.test(hsts),
            `Strict-Transport-Security header missing max-age on ${url}`,
          ).toBeTruthy();
        }
      }

      // Frame ancestors: either X-Frame-Options or CSP frame-ancestors directive
      const xfo = headers['x-frame-options'] || headers['X-Frame-Options'];
      const csp = headers['content-security-policy'] || headers['Content-Security-Policy'] || '';
      const hasFrameAncestors = /frame-ancestors\s+/i.test(csp);
      expect(
        xfo || hasFrameAncestors,
        `Missing frame-ancestors / X-Frame-Options on ${url}`,
      ).toBeTruthy();

      // Cookie flags (Secure, HttpOnly) - check Set-Cookie header presence and flags
      const setCookie = headers['set-cookie'] || headers['Set-Cookie'] || '';
      if (!setCookie) {
        // No cookies set on this route — warn but don't fail
        console.log(`No Set-Cookie header on ${url}; skipping cookie flag checks.`);
      } else {
        // Basic check: header string should contain Secure and HttpOnly for cookies
        const hasSecure = /\bsecure\b/i.test(setCookie);
        const hasHttpOnly = /httponly/i.test(setCookie);
        // If site is HTTPS we expect Secure; always expect HttpOnly for session cookies
        if (url.startsWith('https://')) {
          expect(hasSecure, `Set-Cookie on ${url} missing Secure flag`).toBeTruthy();
        }
        expect(hasHttpOnly, `Set-Cookie on ${url} missing HttpOnly flag`).toBeTruthy();
      }
    });
  }
});
