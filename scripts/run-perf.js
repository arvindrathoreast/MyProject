#!/usr/bin/env node
// wrapper for perf category
const { spawnSync } = require('child_process');
const path = require('path');

function urlFromConfig() {
  try {
    // require JSON config for baseUrl if present
    // path is relative to repo root when this script is executed from npm scripts
    // use __dirname to be safe
    const cfgPath = path.join(__dirname, '..', 'config', 'routes.json');
    // eslint-disable-next-line node/no-missing-require
    const cfg = require(cfgPath);
    if (cfg && cfg.baseUrl) return cfg.baseUrl;
  } catch (e) {
    // ignore if config missing
  }
  return null;
}

const argUrl = process.argv[2];
const envUrl = process.env.BASE_URL;
const cfgUrl = urlFromConfig();
const url = envUrl || argUrl || cfgUrl || 'https://example.com';

const res = spawnSync('node', [path.join(__dirname, 'run-lighthouse.js'), url, 'performance'], {
  stdio: 'inherit',
});
process.exit(res.status);
