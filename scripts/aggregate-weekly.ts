#!/usr/bin/env ts-node
// scripts/aggregate-weekly.ts
// Aggregates daily reports from Azure Blob Storage into weekly summary
// Usage: ts-node scripts/aggregate-weekly.ts [start-date] [end-date]
// Example: ts-node scripts/aggregate-weekly.ts 2025-11-14 2025-11-20

import * as fs from 'fs';
import * as path from 'path';

import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

interface AggregateConfig {
  siteName: string;
  startDate: string;
  endDate: string;
  accountName: string;
  accountKey: string;
  containerName: string;
}

interface PerformanceReport {
  date: string;
  pages: Array<{
    url: string;
    label: string;
    lcp: number;
    cls: number;
    inp: number;
    lh_score: number;
  }>;
}

interface AccessibilityReport {
  date: string;
  scan_id: string;
  violations: Array<{
    fingerprint: string;
    page: string;
    component: string;
    issue: string;
    severity: string;
    wcag_ref: string;
  }>;
}

interface SeoReport {
  date: string;
  pages: Array<{
    url: string;
    has_title: boolean;
    has_meta_description: boolean;
    canonical: string | null;
    robots_index: boolean;
    sitemap_present: boolean;
  }>;
}

interface FunctionalReport {
  date: string;
  functional: {
    total: number;
    failed: number;
    failures: Array<{
      test_id: string;
      area: string;
      severity: string;
    }>;
  };
  visual: {
    total: number;
    failed: number;
    failures: Array<{
      component: string;
      area: string;
      severity: string;
    }>;
  };
}

function getConfig(): AggregateConfig {
  const siteName = process.env.SITE_NAME || 'imagemakers';

  // Parse date arguments or default to last 7 days including today
  let startDate: string;
  let endDate: string;

  if (process.argv[2] && process.argv[3]) {
    startDate = process.argv[2];
    endDate = process.argv[3];
  } else {
    const today = new Date();
    const end = new Date(today); // Include today
    const start = new Date(end);
    start.setDate(start.getDate() - 6); // 7 days total (today - 6 days)

    startDate = start.toISOString().slice(0, 10);
    endDate = end.toISOString().slice(0, 10);
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT;
  const accountKey = process.env.AZURE_STORAGE_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'test-reports';

  if (!accountName || !accountKey) {
    throw new Error(
      'Missing Azure credentials. Set AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY environment variables.',
    );
  }

  return { siteName, startDate, endDate, accountName, accountKey, containerName };
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  return dates;
}

async function downloadReports(config: AggregateConfig): Promise<{
  performance: PerformanceReport[];
  accessibility: AccessibilityReport[];
  seo: SeoReport[];
  functional: FunctionalReport[];
}> {
  const { siteName, startDate, endDate, accountName, accountKey, containerName } = config;

  console.log(`📥 Downloading reports from ${startDate} to ${endDate}...\n`);

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    sharedKeyCredential,
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const dates = getDateRange(startDate, endDate);

  const performance: PerformanceReport[] = [];
  const accessibility: AccessibilityReport[] = [];
  const seo: SeoReport[] = [];
  const functional: FunctionalReport[] = [];

  for (const date of dates) {
    console.log(`  Fetching reports for ${date}...`);

    const reportTypes = [
      { name: 'performance.json', array: performance },
      { name: 'accessibility.json', array: accessibility },
      { name: 'seo.json', array: seo },
      { name: 'functional.json', array: functional },
    ];

    for (const reportType of reportTypes) {
      const blobName = `${siteName}/${date}/${reportType.name}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      try {
        const downloadResponse = await blockBlobClient.download();
        const downloaded = await streamToBuffer(downloadResponse.readableStreamBody!);
        const report = JSON.parse(downloaded.toString());
        reportType.array.push(report);
        console.log(`    ✓ ${reportType.name}`);
      } catch {
        console.log(`    ⚠ ${reportType.name} not found`);
      }
    }
  }

  console.log(
    `\n✅ Downloaded ${performance.length} performance, ${accessibility.length} accessibility, ${seo.length} seo, ${functional.length} functional reports\n`,
  );

  return { performance, accessibility, seo, functional };
}

async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer) => {
      chunks.push(data);
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

function aggregatePerformance(reports: PerformanceReport[]) {
  if (reports.length === 0) return null;

  // Group by URL
  const byUrl = new Map<
    string,
    Array<{ lcp: number; cls: number; inp: number; lh_score: number }>
  >();

  for (const report of reports) {
    for (const page of report.pages) {
      if (!byUrl.has(page.url)) {
        byUrl.set(page.url, []);
      }
      byUrl.get(page.url)!.push({
        lcp: page.lcp,
        cls: page.cls,
        inp: page.inp,
        lh_score: page.lh_score,
      });
    }
  }

  // Calculate averages and percentiles
  const summary = Array.from(byUrl.entries()).map(([url, metrics]) => {
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const p95 = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor(sorted.length * 0.95);
      return sorted[idx];
    };

    return {
      url,
      label: reports[0].pages.find((p) => p.url === url)?.label || url,
      metrics: {
        lcp: { avg: avg(metrics.map((m) => m.lcp)), p95: p95(metrics.map((m) => m.lcp)) },
        cls: { avg: avg(metrics.map((m) => m.cls)), p95: p95(metrics.map((m) => m.cls)) },
        inp: { avg: avg(metrics.map((m) => m.inp)), p95: p95(metrics.map((m) => m.inp)) },
        lh_score: {
          avg: avg(metrics.map((m) => m.lh_score)),
          min: Math.min(...metrics.map((m) => m.lh_score)),
        },
      },
      sample_count: metrics.length,
    };
  });

  return summary;
}

function aggregateAccessibility(reports: AccessibilityReport[]) {
  if (reports.length === 0) return null;

  // Track violations by fingerprint
  const violationTracker = new Map<
    string,
    {
      fingerprint: string;
      page: string;
      component: string;
      issue: string;
      severity: string;
      wcag_ref: string;
      days_present: number;
      dates: string[];
    }
  >();

  for (const report of reports) {
    for (const violation of report.violations) {
      if (!violationTracker.has(violation.fingerprint)) {
        violationTracker.set(violation.fingerprint, {
          ...violation,
          days_present: 0,
          dates: [],
        });
      }
      const tracked = violationTracker.get(violation.fingerprint)!;
      tracked.days_present++;
      tracked.dates.push(report.date);
    }
  }

  const violations = Array.from(violationTracker.values()).map((v) => ({
    fingerprint: v.fingerprint,
    page: v.page,
    component: v.component,
    issue: v.issue,
    severity: v.severity,
    wcag_ref: v.wcag_ref,
    days_present: v.days_present,
    persistent: v.days_present === reports.length,
    first_seen: v.dates[0],
    last_seen: v.dates[v.dates.length - 1],
  }));

  // Count by severity
  const severityCounts = {
    critical: violations.filter((v) => v.severity === 'critical').length,
    serious: violations.filter((v) => v.severity === 'serious').length,
    moderate: violations.filter((v) => v.severity === 'moderate').length,
    minor: violations.filter((v) => v.severity === 'minor').length,
  };

  return {
    total: violations.length,
    new: 0, // TODO: Compare with previous week to determine new violations
    resolved: 0, // TODO: Compare with previous week to determine resolved violations
    critical: severityCounts.critical,
    serious: severityCounts.serious,
    moderate: severityCounts.moderate,
    minor: severityCounts.minor,
    persistent_violations: violations.filter((v) => v.persistent).length,
    violations: violations.sort((a, b) => b.days_present - a.days_present),
  };
}

function getISOWeek(dateStr: string): string {
  const date = new Date(dateStr);
  const thursday = new Date(date.getTime());
  thursday.setDate(date.getDate() + (4 - (date.getDay() || 7)));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function aggregateSeo(reports: SeoReport[], weekStart: string) {
  if (reports.length === 0) return null;

  interface PageIssue {
    url: string;
    issue: string;
    dates: string[];
  }

  // Track SEO status by URL and collect issues
  const seoTracker = new Map<
    string,
    {
      url: string;
      days_checked: number;
      has_title: number;
      has_meta_description: number;
      has_canonical: number;
      robots_index: number;
      sitemap_present: number;
    }
  >();

  const issueTracker = new Map<string, PageIssue>();

  for (const report of reports) {
    for (const page of report.pages) {
      if (!seoTracker.has(page.url)) {
        seoTracker.set(page.url, {
          url: page.url,
          days_checked: 0,
          has_title: 0,
          has_meta_description: 0,
          has_canonical: 0,
          robots_index: 0,
          sitemap_present: 0,
        });
      }
      const tracked = seoTracker.get(page.url)!;
      tracked.days_checked++;
      if (page.has_title) tracked.has_title++;
      if (page.has_meta_description) tracked.has_meta_description++;
      if (page.canonical) tracked.has_canonical++;
      if (page.robots_index) tracked.robots_index++;
      if (page.sitemap_present) tracked.sitemap_present++;

      // Track issues
      if (!page.has_title) {
        const key = `${page.url}::missing_title`;
        if (!issueTracker.has(key)) {
          issueTracker.set(key, { url: page.url, issue: 'Missing title tag', dates: [] });
        }
        issueTracker.get(key)!.dates.push(report.date);
      }
      if (!page.has_meta_description) {
        const key = `${page.url}::missing_meta`;
        if (!issueTracker.has(key)) {
          issueTracker.set(key, { url: page.url, issue: 'Missing meta description', dates: [] });
        }
        issueTracker.get(key)!.dates.push(report.date);
      }
      if (!page.canonical) {
        const key = `${page.url}::missing_canonical`;
        if (!issueTracker.has(key)) {
          issueTracker.set(key, { url: page.url, issue: 'Missing canonical tag', dates: [] });
        }
        issueTracker.get(key)!.dates.push(report.date);
      }
      if (!page.robots_index) {
        const key = `${page.url}::robots_noindex`;
        if (!issueTracker.has(key)) {
          issueTracker.set(key, { url: page.url, issue: 'Robots noindex detected', dates: [] });
        }
        issueTracker.get(key)!.dates.push(report.date);
      }
      if (!page.sitemap_present) {
        const key = `${page.url}::missing_sitemap`;
        if (!issueTracker.has(key)) {
          issueTracker.set(key, { url: page.url, issue: 'Not found in sitemap', dates: [] });
        }
        issueTracker.get(key)!.dates.push(report.date);
      }
    }
  }

  const totalPages = seoTracker.size;
  const pagesWithValidMeta = Array.from(seoTracker.values()).filter(
    (p) => p.has_title === p.days_checked && p.has_meta_description === p.days_checked,
  ).length;
  const validMetaPct = totalPages > 0 ? Math.round((pagesWithValidMeta / totalPages) * 100) : 0;

  const canonicalIssues = Array.from(seoTracker.values()).filter(
    (p) => p.has_canonical < p.days_checked,
  ).length;

  // Check robots status (all pages should be indexable)
  const robotsIssues = Array.from(seoTracker.values()).filter(
    (p) => p.robots_index < p.days_checked,
  ).length;
  const robotsStatus = robotsIssues === 0 ? 'OK' : 'Issues';

  // Check sitemap status (all pages should be in sitemap)
  const sitemapIssues = Array.from(seoTracker.values()).filter(
    (p) => p.sitemap_present < p.days_checked,
  ).length;
  const sitemapStatus = sitemapIssues === 0 ? 'OK' : 'Issues';

  // Format issues with IDs
  const issues = Array.from(issueTracker.values()).map((issue, idx) => {
    const getImpact = (issueText: string): string => {
      if (issueText.includes('Missing title') || issueText.includes('Missing meta description')) {
        return 'high';
      }
      if (issueText.includes('canonical') || issueText.includes('noindex')) {
        return 'medium';
      }
      return 'low';
    };

    return {
      id: `seo-${idx + 1}`,
      page: issue.url,
      issue: issue.issue,
      impact: getImpact(issue.issue),
      status: 'open',
      first_seen: issue.dates[0],
      last_seen: issue.dates[issue.dates.length - 1],
    };
  });

  return {
    week: getISOWeek(weekStart),
    valid_meta_pct: validMetaPct,
    total_pages: totalPages,
    canonical_issues: canonicalIssues,
    robots_status: robotsStatus,
    sitemap_status: sitemapStatus,
    issues: issues.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return (
        impactOrder[a.impact as keyof typeof impactOrder] -
        impactOrder[b.impact as keyof typeof impactOrder]
      );
    }),
  };
}

function aggregateRegression(reports: FunctionalReport[]) {
  if (reports.length === 0) return null;

  // Track test failures
  const functionalFailures = new Map<string, number>();
  const visualFailures = new Map<string, number>();

  let totalFunctionalTests = 0;
  let totalFunctionalFailed = 0;
  let totalVisualTests = 0;
  let totalVisualFailed = 0;

  for (const report of reports) {
    totalFunctionalTests += report.functional.total;
    totalFunctionalFailed += report.functional.failed;
    totalVisualTests += report.visual.total;
    totalVisualFailed += report.visual.failed;

    for (const failure of report.functional.failures) {
      const key = `${failure.area}::${failure.test_id}`;
      functionalFailures.set(key, (functionalFailures.get(key) || 0) + 1);
    }

    for (const failure of report.visual.failures) {
      const key = `${failure.area}::${failure.component}`;
      visualFailures.set(key, (visualFailures.get(key) || 0) + 1);
    }
  }

  const formatFailures = (failures: Map<string, number>) => {
    return Array.from(failures.entries())
      .map(([key, count]) => {
        const [area, name] = key.split('::');
        return { area, name, failure_count: count, flaky: count < reports.length };
      })
      .sort((a, b) => b.failure_count - a.failure_count);
  };

  // Calculate stability score (percentage of tests passing)
  const totalTests = totalFunctionalTests + totalVisualTests;
  const totalFailed = totalFunctionalFailed + totalVisualFailed;
  const stabilityScore =
    totalTests > 0 ? Math.round(((totalTests - totalFailed) / totalTests) * 100) : 0;

  return {
    functional_runs: reports.length,
    functional_tests_total: totalFunctionalTests,
    functional_tests_failed: totalFunctionalFailed,
    visual_runs: reports.length,
    visual_tests_total: totalVisualTests,
    visual_tests_failed: totalVisualFailed,
    stability_score: stabilityScore,
    functional: {
      avg_total: totalFunctionalTests / reports.length,
      failures: formatFailures(functionalFailures),
      flaky_tests: Array.from(functionalFailures.values()).filter((c) => c < reports.length).length,
    },
    visual: {
      avg_total: totalVisualTests / reports.length,
      failures: formatFailures(visualFailures),
      flaky_tests: Array.from(visualFailures.values()).filter((c) => c < reports.length).length,
    },
  };
}

async function main() {
  try {
    console.log('📊 Weekly Report Aggregation\n');

    const config = getConfig();
    console.log(`Site: ${config.siteName}`);
    console.log(`Date Range: ${config.startDate} to ${config.endDate}`);
    console.log(`Container: ${config.containerName}\n`);

    const reports = await downloadReports(config);

    console.log('🔄 Aggregating reports...\n');

    const weeklySummary = {
      week_start: config.startDate,
      week_end: config.endDate,
      site: config.siteName,
      days_reported: Math.max(
        reports.performance.length,
        reports.accessibility.length,
        reports.seo.length,
        reports.functional.length,
      ),
      performance: aggregatePerformance(reports.performance),
      accessibility: aggregateAccessibility(reports.accessibility),
      seo: aggregateSeo(reports.seo, config.startDate),
      regression: aggregateRegression(reports.functional),
    };

    // Write to local file
    const outputDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const filename = `weekly-summary-${config.startDate}-to-${config.endDate}.json`;
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, JSON.stringify(weeklySummary, null, 2), 'utf8');

    console.log('✅ Weekly summary generated!\n');
    console.log(`📁 Saved to: ${outputPath}`);
    console.log(`📊 Days covered: ${weeklySummary.days_reported}`);
  } catch (err) {
    console.error('❌ Aggregation failed:', err);
    process.exit(1);
  }
}

main();
