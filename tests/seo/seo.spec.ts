import { test, expect } from '@playwright/test';

import { allRoutes, urlFor, baseUrl } from '../utils/routes';
import { writeSeoResult, type SeoResult } from '../utils/seo';

test.describe('SEO basics', () => {
  const routes = allRoutes();

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    test(`seo basics: ${route}`, async ({ page, request }) => {
      const full = urlFor(i);
      await page.goto(full, { waitUntil: 'networkidle' });

      const seoData: SeoResult = {
        url: route,
        has_title: false,
        has_meta_description: false,
        canonical: null,
        robots_index: true,
        sitemap_present: false,
      };

      try {
        // Title present and not stupidly short
        const title = (await page.title()).trim();
        seoData.has_title = title.length > 10;
        expect(title.length, `Title too short for ${full}`).toBeGreaterThan(10);

        // Meta description exists and has reasonable length
        const metaDescHandle = await page.$('meta[name="description"]');
        const metaContent = metaDescHandle ? await metaDescHandle.getAttribute('content') : null;
        seoData.has_meta_description = !!(metaContent && metaContent.length > 20);

        expect(metaDescHandle, `Missing meta description on ${full}`).not.toBeNull();
        if (metaContent) {
          expect(metaContent.length, `Meta description length on ${full}`).toBeGreaterThan(20);
          expect(metaContent.length, `Meta description length on ${full}`).toBeLessThan(160);
        }

        // Canonical URL - should be absolute and start with the configured baseUrl
        // Use `page.$` (returns null quickly) instead of locator.getAttribute which auto-waits
        const canonicalHandle = await page.$('link[rel="canonical"]');
        const canonicalHref = canonicalHandle ? await canonicalHandle.getAttribute('href') : null;
        seoData.canonical = canonicalHref || null;

        expect(canonicalHandle, `Missing canonical link on ${full}`).not.toBeNull();
        expect(canonicalHref, `Missing canonical href on ${full}`).toMatch(/https?:\/\/.+/);
        // If baseUrl is configured, canonical should start with it
        const b = baseUrl();
        if (b && canonicalHref) {
          const baseNormalized = b.endsWith('/') ? b.slice(0, -1) : b;
          expect(
            canonicalHref.startsWith(baseNormalized),
            `Canonical does not start with baseUrl on ${full}`,
          ).toBeTruthy();
        }

        // Check meta robots tag
        const metaRobotsHandle = await page.$('meta[name="robots"]');
        const robotsContent = metaRobotsHandle
          ? await metaRobotsHandle.getAttribute('content')
          : null;
        seoData.robots_index = !robotsContent || !/noindex/i.test(robotsContent);

        // Check if sitemap.xml exists
        const baseUrlValue = baseUrl();
        if (baseUrlValue) {
          try {
            const sitemapRes = await request.get(new URL('/sitemap.xml', baseUrlValue).toString());
            seoData.sitemap_present = sitemapRes.ok();
          } catch {
            // ignore network errors
          }
        }

        // Single H1
        const h1Count = await page.locator('h1').count();
        expect(h1Count, `Expected exactly one H1 on ${full}, found ${h1Count}`).toBe(1);

        // Optional: basic JSON-LD schema presence and validity
        const ldNodes = page.locator('script[type="application/ld+json"]');
        const ldCount = await ldNodes.count();
        if (ldCount > 0) {
          const text = await ldNodes.first().innerText();
          try {
            const parsed = JSON.parse(text);
            // basic smoke check: has @context or @type
            const hasContextOrType = Boolean(parsed && (parsed['@context'] || parsed['@type']));
            expect(
              hasContextOrType,
              `JSON-LD present but missing @context/@type on ${full}`,
            ).toBeTruthy();
          } catch (err) {
            throw new Error(`Invalid JSON-LD on ${full}: ${String(err)}`);
          }
        }
      } finally {
        // Write SEO data for aggregation even if tests fail
        writeSeoResult(seoData);
      }
    });
  }
});
