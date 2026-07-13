import fs from 'fs';
import path from 'path';

import { test, expect } from '@playwright/test';

import { baseUrl as routesBaseUrl } from '../utils/routes';

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
// Use the existing routes helper as the authoritative baseUrl so we don't break other tests
const BASE =
  process.env.BASE_URL || routesBaseUrl() || (envDef && envDef.baseUrl) || 'https://example.com';
const EXPECT_BLOCKED = process.env.ROBOTS_BLOCKED
  ? process.env.ROBOTS_BLOCKED === '1' || process.env.ROBOTS_BLOCKED === 'true'
  : envDef && typeof envDef.robotsBlocked === 'boolean'
    ? envDef.robotsBlocked
    : false;

test.describe('robots.txt checks', () => {
  test(`robots.txt for env=${chosen} (${BASE}) should ${
    EXPECT_BLOCKED ? 'block' : 'not block'
  }`, async ({ request }) => {
    const url = new URL('/robots.txt', BASE).toString();
    const res = await request.get(url);
    expect(res.ok(), `Could not fetch robots.txt at ${url}`).toBeTruthy();

    const text = await res.text();

    // Normalize whitespace and case
    const norm = text.replace(/\r/g, '').toLowerCase();

    // Detect a global "Disallow: /" for all user agents
    const globalDisallowRegex = /user-agent:\s*\*[^\n]*\n[^\n]*disallow:\s*\//i;
    const hasGlobalDisallow = globalDisallowRegex.test(text);

    if (EXPECT_BLOCKED) {
      expect(
        hasGlobalDisallow || /disallow:\s*\//i.test(norm),
        `Expected robots.txt to block crawling on ${url} but it did not. Contents:\n${text}`,
      ).toBeTruthy();
    } else {
      // For production we assert there is NOT a global disallow
      expect(
        hasGlobalDisallow,
        `robots.txt appears to block crawling on ${url}, but expected public site`,
      ).toBeFalsy();
    }
  });
});
