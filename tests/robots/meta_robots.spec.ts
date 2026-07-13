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
const chosen = process.env.ROBOTS_ENV || (envCfg && envCfg.default) || 'production';
const envDef =
  envCfg && envCfg.environments && envCfg.environments[chosen] ? envCfg.environments[chosen] : null;
const BASE =
  process.env.BASE_URL || routesBaseUrl() || (envDef && envDef.baseUrl) || 'https://example.com';
const EXPECT_NOINDEX = process.env.ROBOTS_NOINDEX
  ? process.env.ROBOTS_NOINDEX === '1' || process.env.ROBOTS_NOINDEX === 'true'
  : envDef && typeof envDef.robotsBlocked === 'boolean'
    ? envDef.robotsBlocked
    : false;

test.describe('Meta robots / X-Robots-Tag checks', () => {
  const routes = allRoutes();

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    test(`robots-meta: ${route} (env=${chosen})`, async ({ request }) => {
      const full = new URL(route.startsWith('/') ? route : `/${route}`, BASE).toString();
      const res = await request.get(full);
      expect(res.ok(), `Failed to fetch ${full}`).toBeTruthy();

      // Check X-Robots-Tag header
      const xrobots = res.headers()['x-robots-tag'] || '';
      const hasHeaderNoindex = /noindex/i.test(xrobots);

      // Check meta robots tags in HTML
      const body = await res.text();
      const metaRobotsMatch = body.match(/<meta[^>]*name=["']?(robots|googlebot)["']?[^>]*>/i);
      let metaContent = '';
      if (metaRobotsMatch) {
        const tag = metaRobotsMatch[0];
        const contentMatch = tag.match(/content=["']?([^"'>]+)["']?/i);
        if (contentMatch) metaContent = contentMatch[1] || '';
      }
      const hasMetaNoindex = /noindex/i.test(metaContent);

      if (EXPECT_NOINDEX) {
        // staging/dev: must include noindex either via header or meta
        expect(
          hasHeaderNoindex || hasMetaNoindex,
          `Expected noindex on ${full} (header:${xrobots})\nmeta: ${metaContent}`,
        ).toBeTruthy();
      } else {
        // prod: must NOT include noindex in either header or meta
        expect(
          hasHeaderNoindex,
          `X-Robots-Tag contains noindex on ${full} but expected public`,
        ).toBeFalsy();
        expect(
          hasMetaNoindex,
          `Meta robots contains noindex on ${full} but expected public`,
        ).toBeFalsy();
      }
    });
  }
});
