#!/usr/bin/env node
// scripts/aggregate-functional.js
// Aggregates e2e and visual test results into functional/visual report
// Usage: node scripts/aggregate-functional.js

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

function parsePlaywrightReport() {
  // Try to read the JSON report from Playwright
  const reportPath = path.resolve(process.cwd(), 'playwright-report', 'report.json');
  if (!fs.existsSync(reportPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(reportPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractTestResults(jsonReport) {
  if (!jsonReport || !jsonReport.suites) return { e2e: [], visual: [] };

  const e2eTests = [];
  const visualTests = [];

  function walkSuites(suites, parentPath = '') {
    for (const suite of suites) {
      const suitePath = parentPath ? `${parentPath} > ${suite.title}` : suite.title;
      const file = suite.file || '';
      const isVisual =
        file.includes('/visual/') ||
        file.includes('\\visual\\') ||
        file.includes('visual/') ||
        file.includes('visual\\');
      const isE2e =
        file.includes('/e2e/') ||
        file.includes('\\e2e\\') ||
        file.includes('e2e/') ||
        file.includes('e2e\\');
      if (suite.specs) {
        for (const spec of suite.specs) {
          const testName = spec.title || '';

          // Check test status
          const tests = spec.tests || [];
          let failed = false;
          let error = null;

          for (const t of tests) {
            const results = t.results || [];
            for (const r of results) {
              if (r.status === 'failed' || r.status === 'timedOut') {
                failed = true;
                error = r.error?.message || r.error || 'Unknown error';
                break;
              }
            }
            if (failed) break;
          }

          const testData = {
            test_id: testName,
            area: suitePath,
            failed,
            error,
          };

          if (isVisual) {
            visualTests.push(testData);
          } else if (isE2e) {
            e2eTests.push(testData);
          }
        }
      }

      if (suite.suites) {
        const results = walkSuites(suite.suites, suitePath);
        e2eTests.push(...results.e2e);
        visualTests.push(...results.visual);
      }
    }

    return { e2e: e2eTests, visual: visualTests };
  }

  return walkSuites(jsonReport.suites);
}

function determineSeverity(testName, area) {
  // Simple heuristic for severity
  const criticalKeywords = ['payment', 'checkout', 'login', 'auth'];
  const highKeywords = ['search', 'cart', 'order'];
  const combined = `${testName} ${area}`.toLowerCase();

  for (const kw of criticalKeywords) {
    if (combined.includes(kw)) return 'critical';
  }
  for (const kw of highKeywords) {
    if (combined.includes(kw)) return 'high';
  }

  return 'medium';
}

function buildReport(e2eTests, visualTests) {
  const scanDate = new Date().toISOString().slice(0, 10);

  const e2eFailures = e2eTests
    .filter((t) => t.failed)
    .map((t) => ({
      test_id: t.test_id,
      area: t.area,
      severity: determineSeverity(t.test_id, t.area),
    }));

  const visualFailures = visualTests
    .filter((t) => t.failed)
    .map((t) => ({
      component: t.test_id,
      area: t.area,
      severity: determineSeverity(t.test_id, t.area),
    }));

  return {
    date: scanDate,
    functional: {
      total: e2eTests.length,
      failed: e2eFailures.length,
      failures: e2eFailures,
    },
    visual: {
      total: visualTests.length,
      failed: visualFailures.length,
      failures: visualFailures,
    },
  };
}

// MAIN
(function main() {
  const jsonReport = parsePlaywrightReport();

  if (!jsonReport) {
    console.error('No Playwright JSON report found at playwright-report/report.json');
    console.log('Run tests with PLAYWRIGHT_JSON_OUTPUT_NAME=report.json or generate JSON report');
    process.exit(1);
  }

  const { e2e, visual } = extractTestResults(jsonReport);
  const report = buildReport(e2e, visual);

  const outDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `functional-visual-${report.date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  console.log('\nWrote functional/visual report to:', outPath);
})();
