import fs from 'fs';
import path from 'path';

// Use CommonJS require for packages that may export in CJS/ESM shapes
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chromeLauncher = require('chrome-launcher');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lighthouseModule = require('lighthouse');
const lighthouse = lighthouseModule.default || lighthouseModule;

type RunnerResult = any;

function readRoutesConfig() {
  try {
    const cfgPath = path.resolve(process.cwd(), 'config', 'routes.json');
    if (fs.existsSync(cfgPath)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(cfgPath);
    }
  } catch {
    // ignore
  }
  return {};
}

async function run() {
  const cfg = readRoutesConfig();
  const baseUrl = process.env.BASE_URL || cfg.baseUrl || 'https://example.com';
  const routesRaw = cfg.routes && Array.isArray(cfg.routes) ? cfg.routes : ['/'];
  // Normalize routes to objects: { url: string, label?: string }
  const routes: Array<{ url: string; label?: string }> = routesRaw.map((r: any) =>
    typeof r === 'string' ? { url: r } : { url: r.url || '/', label: r.label },
  );
  const category = process.argv[2] || 'performance';
  const threshold = Number(process.env.PERF_SCORE_THRESHOLD || process.env.PERF_THRESHOLD || 70);
  const budgetsPath = cfg.budgetsPath
    ? path.resolve(process.cwd(), cfg.budgetsPath)
    : path.resolve(process.cwd(), 'config', 'lighthouse-budgets.json');
  const hasBudgets = fs.existsSync(budgetsPath);
  const budgets = hasBudgets ? JSON.parse(fs.readFileSync(budgetsPath, 'utf8')) : null;

  console.log(`Running Lighthouse category=${category} against ${baseUrl} routes=${routes.length}`);

  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox'] });
  // Emit reports to the repository-level `reports/` directory so CI can collect
  // multiple report types from a single place.
  const outDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let failed = false;

  const pagesOutput: Array<any> = [];

  const humanizeLabel = (u: string) => {
    if (!u || u === '/') return 'Homepage';
    // trim leading/trailing slashes
    const trimmed = u.replace(/^\/+|\/+$/g, '');
    if (!trimmed) return 'Homepage';
    // words from path
    const parts = trimmed.split('/');
    const last = parts[parts.length - 1];
    // replace hyphens with spaces and titlecase
    return last.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };

  for (const routeObj of routes) {
    const route = routeObj.url;
    const normalized = route.startsWith('/') ? route : `/${route}`;
    const testUrl = `${baseUrl}${normalized}`;
    console.log(`\n=== Lighthouse: ${testUrl} ===`);

    const flags: any = { port: chrome.port, output: 'html', onlyCategories: [category] };
    // Keep budgetsPath for CLI compatibility; additionally we'll enforce budgets manually
    if (hasBudgets) flags.budgetsPath = budgetsPath;

    const runnerResult: RunnerResult = await lighthouse(testUrl, flags);

    const reportHtml = runnerResult.report;
    const safeName = normalized.replace(/[^\w]+/g, '_') || 'home';
    const htmlPath = path.join(outDir, `${safeName}-${category}.html`);
    fs.writeFileSync(htmlPath, reportHtml, 'utf8');
    const jsonPath = path.join(outDir, `${safeName}-${category}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(runnerResult.lhr, null, 2), 'utf8');
    console.log(`Wrote reports: ${htmlPath}, ${jsonPath}`);

    const perfScore =
      ((runnerResult.lhr &&
        runnerResult.lhr.categories &&
        runnerResult.lhr.categories.performance &&
        runnerResult.lhr.categories.performance.score) ||
        0) * 100;
    console.log(`Performance score: ${perfScore}`);
    if (!Number.isNaN(threshold) && perfScore < threshold) {
      console.warn(`⚠️ Perf score below threshold (${threshold}) on ${testUrl}`);
      failed = true;
    }

    // Additional performance audits to check and optional budgets enforcement
    try {
      const audits = runnerResult.lhr && runnerResult.lhr.audits ? runnerResult.lhr.audits : {};

      // Determine if a budget applies to this route and extract timing thresholds
      const matchBudgetForRoute = (route: string) => {
        if (!budgets || !Array.isArray(budgets)) return null;
        const r = route || '/';
        for (const b of budgets) {
          if (!b.path) continue;
          const p: string = b.path;
          if (p === '*' || p === '/*') return b;
          if (p.endsWith('*')) {
            const prefix = p.slice(0, -1);
            if (r.startsWith(prefix)) return b;
          }
          if (r === p) return b;
        }
        return null;
      };

      const matchedBudget = matchBudgetForRoute(normalized);
      const budgetTimings = matchedBudget && matchedBudget.timings ? matchedBudget.timings : null;

      // Total Blocking Time (TBT) - threshold in ms
      const tbtAudit = audits['total-blocking-time'];
      const tbtValue =
        tbtAudit && typeof tbtAudit.numericValue === 'number' ? tbtAudit.numericValue : null;
      const TBT_THRESHOLD =
        budgetTimings &&
        budgetTimings['total-blocking-time'] &&
        typeof budgetTimings['total-blocking-time'].numericValue === 'number'
          ? Number(budgetTimings['total-blocking-time'].numericValue)
          : Number(process.env.TBT_THRESHOLD || 300);
      if (tbtValue !== null) {
        console.log(`Total Blocking Time: ${tbtValue} ms`);
        if (tbtValue > TBT_THRESHOLD) {
          console.warn(
            `⚠️ Total Blocking Time (${tbtValue}ms) exceeds threshold (${TBT_THRESHOLD}ms)`,
          );
          failed = true;
        }
      }

      // Largest Contentful Paint (LCP) - threshold in ms
      const lcpAudit = audits['largest-contentful-paint'];
      const lcpValue =
        lcpAudit && typeof lcpAudit.numericValue === 'number' ? lcpAudit.numericValue : null;
      const LCP_THRESHOLD =
        budgetTimings &&
        budgetTimings['largest-contentful-paint'] &&
        typeof budgetTimings['largest-contentful-paint'].numericValue === 'number'
          ? Number(budgetTimings['largest-contentful-paint'].numericValue)
          : Number(process.env.LCP_THRESHOLD || 2500);
      if (lcpValue !== null) {
        console.log(`Largest Contentful Paint: ${lcpValue} ms`);
        if (lcpValue > LCP_THRESHOLD) {
          console.warn(`⚠️ LCP (${lcpValue}ms) exceeds threshold (${LCP_THRESHOLD}ms)`);
          failed = true;
        }
      }

      // Cumulative Layout Shift (CLS)
      const clsAudit = audits['cumulative-layout-shift'];
      const clsValue =
        clsAudit && typeof clsAudit.numericValue === 'number' ? clsAudit.numericValue : null;
      const CLS_THRESHOLD =
        budgetTimings &&
        budgetTimings['cumulative-layout-shift'] &&
        typeof budgetTimings['cumulative-layout-shift'].numericValue === 'number'
          ? Number(budgetTimings['cumulative-layout-shift'].numericValue)
          : Number(process.env.CLS_THRESHOLD || 0.1);
      if (clsValue !== null) {
        console.log(`Cumulative Layout Shift: ${clsValue}`);
        if (clsValue > CLS_THRESHOLD) {
          console.warn(`⚠️ CLS (${clsValue}) exceeds threshold (${CLS_THRESHOLD})`);
          failed = true;
        }
      }

      // Time To Interactive (TTI) - audit id 'interactive', threshold in ms
      const ttiAudit = audits['interactive'];
      const ttiValue =
        ttiAudit && typeof ttiAudit.numericValue === 'number' ? ttiAudit.numericValue : null;
      const TTI_THRESHOLD =
        budgetTimings &&
        budgetTimings['time-to-interactive'] &&
        typeof budgetTimings['time-to-interactive'].numericValue === 'number'
          ? Number(budgetTimings['time-to-interactive'].numericValue)
          : Number(process.env.TTI_THRESHOLD || 3800);
      if (ttiValue !== null) {
        console.log(`Time To Interactive: ${ttiValue} ms`);
        if (ttiValue > TTI_THRESHOLD) {
          console.warn(`⚠️ TTI (${ttiValue}ms) exceeds threshold (${TTI_THRESHOLD}ms)`);
          failed = true;
        }
      }

      // Capture LCP (ms), CLS, INP (ms if available)
      const lcpMs = lcpValue !== null ? Number(lcpValue) : null;
      const cls = clsValue !== null ? Number(clsValue) : null;

      // INP audit: try common audit ids (interaction-to-next-paint or experimental-interaction-to-next-paint)
      const inpCandidates = [
        'interaction-to-next-paint',
        'experimental-interaction-to-next-paint',
        'max-potential-fid',
      ];
      let inpMs: number | null = null;
      for (const id of inpCandidates) {
        const a = audits[id];
        if (a && typeof a.numericValue === 'number') {
          inpMs = Number(a.numericValue);
          break;
        }
      }

      // Build page summary entry
      const pageLabel = routeObj.label || humanizeLabel(normalized);
      pagesOutput.push({
        url: normalized,
        label: pageLabel,
        lcp: lcpMs !== null ? Math.round((lcpMs / 10) * 10) / 1000 : null, // round to 2 decimals seconds
        cls: cls !== null ? Number(cls) : null,
        inp: inpMs !== null ? Math.round(inpMs) : null,
        lh_score: Number(perfScore),
      });

      // Blocking-script audit: use 'render-blocking-resources' or rely on TBT
      const rbrAudit = audits['render-blocking-resources'];
      if (rbrAudit) {
        const displayValue = rbrAudit.displayValue || rbrAudit.description || '';
        console.log(`Render-blocking resources: ${displayValue}`);
        // If the score is present and less than 1, consider it a warning
        if (typeof rbrAudit.score === 'number' && rbrAudit.score < 1) {
          console.warn(`⚠️ Render-blocking resources score low (${rbrAudit.score})`);
          // Not automatically failing by default; enable with env var
          if (process.env.FAIL_ON_RENDER_BLOCKING === '1') failed = true;
        }
      }
    } catch (err) {
      console.warn('Could not evaluate additional performance audits:', err);
    }
  }

  await chrome.kill();

  // Write performance summary JSON
  try {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const summary = {
      date: dateStr,
      pages: pagesOutput,
    };
    const summaryPath = path.join(outDir, `perf-summary-${dateStr}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    // Also log to console for CI logs
    console.log('\n=== Lighthouse Performance Summary ===');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Wrote performance summary: ${summaryPath}`);
  } catch (err) {
    console.warn('Failed to write performance summary:', err);
  }

  if (failed) {
    console.error('Performance budgets not met on one or more URLs.');
    process.exit(1);
  }

  console.log('\n✅ Performance checks completed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
