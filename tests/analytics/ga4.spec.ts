import fs from 'fs';
import path from 'path';

import { test, expect } from '@playwright/test';

import { allRoutes, baseUrl as routesBaseUrl } from '../utils/routes';

function readEnvironmentsConfig() {
  try {
    const cfgPath = path.resolve(process.cwd(), 'config', 'environments.json');
    if (fs.existsSync(cfgPath)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(cfgPath);
    }
  } catch (e) {
    // ignore
  }
  return null;
}

const envCfg = readEnvironmentsConfig();
const chosen =
  process.env.ANALYTICS_ENV || process.env.ROBOTS_ENV || (envCfg && envCfg.default) || 'production';
const envDef =
  envCfg && envCfg.environments && envCfg.environments[chosen] ? envCfg.environments[chosen] : null;
const BASE =
  process.env.BASE_URL || routesBaseUrl() || (envDef && envDef.baseUrl) || 'https://example.com';
const EXPECT_MEASUREMENT_ID =
  process.env.GA4_MEASUREMENT_ID || (envDef && envDef.ga4MeasurementId) || '';
const EXPECT_CONVERSION_EVENTS: string[] =
  (envDef && (envDef.expectedConversionEvents || [])) || [];

test.describe('GA4 basic checks', () => {
  const routes = allRoutes();
  const SAMPLE = Math.min(routes.length, 5);

  for (let i = 0; i < SAMPLE; i++) {
    const route = routes[i];
    test(`GA4 presence: ${route}`, async ({ page }) => {
      const full = new URL(route.startsWith('/') ? route : `/${route}`, BASE).toString();

      const requests: string[] = [];
      const errors: Error[] = [];

      page.on('request', (req) => {
        const u = req.url();
        if (
          u.includes('google-analytics.com/g/collect') ||
          u.includes('www.google-analytics.com/g/collect')
        ) {
          requests.push(u);
        }
      });
      page.on('pageerror', (err) => errors.push(err));

      // Navigate and wait
      await page.goto(full, { waitUntil: 'networkidle' });
      // give analytics a bit more time to fire
      await page.waitForTimeout(1000);

      // Check that the GA script tag exists (gtag.js) or GTM script or that requests fired
      const gtagScriptHandle = await page.$('script[src*="gtag/js"]');
      const gtmScriptHandle = await page.$('script[src*="googletagmanager.com/gtm.js"]');
      let foundId: string | null = null;

      // Check for GA4 measurement ID (G-XXXXXX)
      if (gtagScriptHandle) {
        const src = await gtagScriptHandle.getAttribute('src');
        if (src) {
          const m = src.match(/id=(G-[A-Za-z0-9_-]+)/);
          if (m) foundId = m[1];
        }
      }

      // Check for GTM container ID (GTM-XXXXXX)
      if (!foundId && gtmScriptHandle) {
        const src = await gtmScriptHandle.getAttribute('src');
        if (src) {
          const m = src.match(/id=(GTM-[A-Za-z0-9_-]+)/);
          if (m) foundId = m[1];
        }
      }

      // Also check inline config for measurement ID (both G- and GTM- patterns)
      if (!foundId) {
        const html = await page.content();
        const m2 = html.match(/G-[A-Za-z0-9_-]+/g);
        if (m2 && m2.length) foundId = m2[0];

        // Also check for GTM ID
        if (!foundId) {
          const m3 = html.match(/GTM-[A-Za-z0-9_-]+/g);
          if (m3 && m3.length) foundId = m3[0];
        }
      }

      const dataLayerExists = await page.evaluate(() => !!(window as any).dataLayer);
      const dataLayer = dataLayerExists
        ? await page.evaluate(() =>
            (window as any).dataLayer.slice
              ? (window as any).dataLayer.slice(0)
              : (window as any).dataLayer,
          )
        : [];

      // 1) Tag presence: either script tag or network request or dataLayer present
      const tagPresent = !!foundId || requests.length > 0 || dataLayerExists;
      expect(
        tagPresent,
        `No GA4 tag detected on ${full} (script id, g/collect request or dataLayer)`,
      ).toBeTruthy();

      // 2) If EXPECT_MEASUREMENT_ID provided, assert it's used either in script src, inline config, or requests
      if (EXPECT_MEASUREMENT_ID) {
        const idMatchInRequests = requests.some((u) => u.includes(EXPECT_MEASUREMENT_ID));

        // Search more thoroughly for the ID - check all page content and dataLayer
        const html = await page.content();
        const allGIds = html.match(/G-[A-Z0-9_-]+/gi) || [];
        const allGTMIds = html.match(/GTM-[A-Z0-9_-]+/gi) || [];
        const allFoundIds = [...new Set([...allGIds, ...allGTMIds])];

        const idFound =
          foundId === EXPECT_MEASUREMENT_ID ||
          idMatchInRequests ||
          allFoundIds.includes(EXPECT_MEASUREMENT_ID) ||
          (dataLayer &&
            dataLayer.some((d: any) => JSON.stringify(d).includes(EXPECT_MEASUREMENT_ID)));

        // Log what was found for debugging
        if (!idFound) {
          console.log(`\nDebug info for ${full}:`);
          console.log(`Expected: ${EXPECT_MEASUREMENT_ID}`);
          console.log(`Found IDs in page: ${allFoundIds.join(', ') || 'none'}`);
          console.log(`Found in requests: ${idMatchInRequests}`);
          console.log(`DataLayer present: ${dataLayerExists}`);
        }

        expect(
          idFound,
          `Expected GA4 measurement ID ${EXPECT_MEASUREMENT_ID} not found on ${full}. Found IDs: ${allFoundIds.join(', ')}`,
        ).toBeTruthy();
      }

      // 3) Tag loads without JS errors
      expect(
        errors.length,
        `JS errors while loading ${full}: ${errors.map((e) => e.message).join('; ')}`,
      ).toBe(0);

      // 4) Page_view event check: look for analytics activity
      // GTM/GA4 can use various event names: 'page_view', 'gtm.js', 'gtm.dom', 'gtm.load', etc.
      const pageViewInDataLayer =
        dataLayer &&
        dataLayer.some(
          (d: any) =>
            d &&
            (d.event === 'page_view' ||
              d.event === 'gtm.js' ||
              d.event === 'gtm.dom' ||
              d.event === 'gtm.load'),
        );
      const pageViewRequest = requests.length > 0;

      // More lenient: accept if dataLayer exists with any events OR if we got g/collect requests
      const hasAnalyticsActivity =
        pageViewInDataLayer || pageViewRequest || (dataLayer && dataLayer.length > 0);

      expect(
        hasAnalyticsActivity,
        `No analytics activity detected for ${full}. DataLayer entries: ${dataLayer ? dataLayer.length : 0}, g/collect requests: ${requests.length}`,
      ).toBeTruthy();

      // 5) Conversion events: if expectedConversionEvents configured, check dataLayer contains them
      if (EXPECT_CONVERSION_EVENTS.length > 0) {
        for (const evt of EXPECT_CONVERSION_EVENTS) {
          const found =
            dataLayer &&
            dataLayer.some((d: any) => d && (d.event === evt || JSON.stringify(d).includes(evt)));
          expect(found, `Expected conversion event ${evt} in dataLayer on ${full}`).toBeTruthy();
        }
      }
    });
  }
});
