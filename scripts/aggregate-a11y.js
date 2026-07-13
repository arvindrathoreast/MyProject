#!/usr/bin/env node
// scripts/aggregate-a11y.js
// Aggregates accessibility scan results into daily report
// Usage: node scripts/aggregate-a11y.js [--date=YYYY-MM-DD]

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

function listA11yFiles(dirs) {
  const files = [];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (f.toLowerCase().endsWith('.json') && f.includes('axe-results')) {
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
    } catch (err) {
      console.warn('Skipping unreadable file:', f, err.message);
    }
  }
  reports.sort((a, b) => a.mtime - b.mtime);
  return reports;
}

function extractWcagRef(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const match = tag.match(/wcag(\d+)(\d+)(\d+)?/i);
    if (match) {
      const [, a, b, c] = match;
      return c ? `${a}.${b}.${c}` : `${a}.${b}`;
    }
  }
  return null;
}

function normalizeViolations(report, _scanId) {
  const violations = report.violations || [];
  const pageUrl = report.url || report.pageUrl || '';
  const items = [];

  for (const v of violations) {
    const ruleId = v.id || 'unknown-rule';
    const impact = (v.impact || 'minor').toLowerCase();
    const description = v.description || v.help || v.message || '';
    const wcagRef = extractWcagRef(v.tags) || null;
    const nodes = v.nodes && Array.isArray(v.nodes) ? v.nodes : [];

    for (const node of nodes) {
      const target = Array.isArray(node.target)
        ? node.target.join(' | ')
        : String(node.target || '');
      const fingerprint = `page=${pageUrl}|selector=${target}|rule=${ruleId}`;

      const sev = impact === 'critical' ? 'critical' : impact === 'serious' ? 'serious' : 'minor';

      items.push({
        fingerprint,
        page: pageUrl || '',
        component: target || '',
        issue: description || '',
        severity: sev,
        wcag_ref: wcagRef || null,
      });
    }
  }
  return items;
}

function buildDailySummary(reports) {
  // Use the most recent report timestamp
  const latest = reports[reports.length - 1];
  const scanDate = latest.mtime.toISOString().slice(0, 10);
  const scanId = latest.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const violations = [];
  const seen = new Set();

  for (const r of reports) {
    const items = normalizeViolations(r.data, scanId);
    for (const item of items) {
      if (!seen.has(item.fingerprint)) {
        seen.add(item.fingerprint);
        violations.push(item);
      }
    }
  }

  return {
    date: scanDate,
    scan_id: scanId,
    violations,
  };
}

// MAIN
(function main() {
  const argv = process.argv.slice(2);
  const opts = {};
  for (const a of argv) {
    if (a.startsWith('--date=')) opts.date = a.split('=')[1];
  }

  const possibleDirs = [
    path.resolve(process.cwd(), 'a11y-report'),
    path.resolve(process.cwd(), 'reports'),
  ];

  const files = listA11yFiles(possibleDirs);
  if (!files.length) {
    console.error('No accessibility JSON files found in:', possibleDirs);
    process.exit(1);
  }

  const loaded = loadReports(files);

  if (!loaded.length) {
    console.log('No violations found in reports');
    const now = new Date();
    const emptyReport = {
      date: now.toISOString().slice(0, 10),
      scan_id: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      violations: [],
    };
    const outDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `accessibility-${emptyReport.date}.json`);
    fs.writeFileSync(outPath, JSON.stringify(emptyReport, null, 2), 'utf8');
    console.log(JSON.stringify(emptyReport, null, 2));
    console.log('\nWrote accessibility report to:', outPath);
    return;
  }

  const summary = buildDailySummary(loaded);

  const outDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `accessibility-${summary.date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log('\nWrote accessibility report to:', outPath);
})();
