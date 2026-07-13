#!/usr/bin/env node
// scripts/aggregate-seo.js
// Aggregates SEO test results into daily report
// Usage: node scripts/aggregate-seo.js

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

function listSeoFiles(dirs) {
  const files = [];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (f.toLowerCase().endsWith('.json') && f.includes('seo-results')) {
          files.push(path.join(d, f));
        }
      }
    } catch {
      // ignore
    }
  }
  return files;
}

function loadReports(files) {
  const reports = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f, 'utf8');
      const data = JSON.parse(raw);
      const stats = fs.statSync(f);
      reports.push({ path: f, data, mtime: stats.mtime });
    } catch (e) {
      console.warn('Skipping unreadable file:', f, e.message);
    }
  }
  reports.sort((a, b) => a.mtime - b.mtime);
  return reports;
}

function buildSeoReport(reports) {
  const latest = reports.length > 0 ? reports[reports.length - 1] : null;
  const scanDate = latest
    ? latest.mtime.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const pages = [];
  const seen = new Set();

  for (const r of reports) {
    const data = r.data;
    if (!data || !data.url) continue;

    const url = data.url || '';
    if (seen.has(url)) continue;
    seen.add(url);

    pages.push({
      url,
      has_title: data.has_title !== false,
      has_meta_description: data.has_meta_description !== false,
      canonical: data.canonical || null,
      robots_index: data.robots_index !== false,
      sitemap_present: data.sitemap_present !== false,
    });
  }

  return {
    date: scanDate,
    pages,
  };
}

// MAIN
(function main() {
  const possibleDirs = [
    path.resolve(process.cwd(), 'seo-report'),
    path.resolve(process.cwd(), 'reports'),
  ];

  const files = listSeoFiles(possibleDirs);

  if (!files.length) {
    console.log('No SEO report files found, generating empty report');
    const emptyReport = {
      date: new Date().toISOString().slice(0, 10),
      pages: [],
    };
    const outDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `seo-${emptyReport.date}.json`);
    fs.writeFileSync(outPath, JSON.stringify(emptyReport, null, 2), 'utf8');
    console.log(JSON.stringify(emptyReport, null, 2));
    console.log('\nWrote SEO report to:', outPath);
    return;
  }

  const loaded = loadReports(files);
  const report = buildSeoReport(loaded);

  const outDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `seo-${report.date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  console.log('\nWrote SEO report to:', outPath);
})();
