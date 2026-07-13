// Small helper to run axe-core/playwright checks across versions
// Uses runtime require to avoid import shape issues and provides a simple
// `checkA11y` function that throws when violations exist.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Axe = require('@axe-core/playwright');

export async function runAxeAnalysis(page: any) {
  // Axe may export a class (default) — normalize to constructor
  const AxeBuilder = typeof Axe === 'function' ? Axe : Axe.default || Axe.AxeBuilder || Axe;
  const builder = new AxeBuilder({ page });
  const results = await builder.analyze();
  return results;
}
function impactRank(impact: string | null | undefined) {
  // order from least -> most severe
  const order = ['minor', 'moderate', 'serious', 'critical'];
  const idx = order.indexOf(String(impact));
  return idx === -1 ? 0 : idx;
}

function ensureDir(path: string) {
  // lazy create directory
  const fs = require('fs');
  if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
}

export async function checkA11y(
  page: any,
  options?: {
    threshold?: 'moderate' | 'serious' | 'critical' | 'minor' | string;
    writeReport?: boolean;
  },
) {
  const threshold = options?.threshold || 'serious';
  const writeReport = options?.writeReport !== false; // default true
  const results = await runAxeAnalysis(page);
  const violations = results && results.violations ? results.violations : [];

  // Write full results for triage
  if (writeReport) {
    try {
      const fs = require('fs');
      const outDir = 'a11y-report';
      ensureDir(outDir);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${outDir}/axe-results-${ts}.json`;
      fs.writeFileSync(filename, JSON.stringify(results, null, 2), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`Wrote axe results to ${filename}`);
    } catch (e) {
      // ignore write failures but log
      // eslint-disable-next-line no-console
      console.warn('Could not write axe results:', (e as any)?.message ?? e);
    }
  }

  // Only fail on violations at or above the configured threshold
  const threshRank = impactRank(threshold);
  const failing = violations.filter((v: any) => impactRank(v.impact) >= threshRank);

  // Log summary
  // eslint-disable-next-line no-console
  console.log(
    `axe: total violations=${violations.length}, failing (>=${threshold})=${failing.length}`,
  );

  if (failing.length) {
    // Create a concise summary for the report
    const summary = failing.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes && v.nodes.length,
    }));
    const shortSummary = summary.slice(0, 50);
    const reportSummary = {
      threshold,
      totalViolations: violations.length,
      failingCount: failing.length,
      failing: shortSummary,
      ts: new Date().toISOString(),
    };

    // write summary next to the full results so triage can be easier
    let summaryPath: string | null = null;
    let writeErr: any = null;
    try {
      const fs = require('fs');
      const outDir = 'a11y-report';
      ensureDir(outDir);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const summaryPathLocal = `${outDir}/axe-summary-${ts}.json`;
      fs.writeFileSync(summaryPathLocal, JSON.stringify(reportSummary, null, 2), 'utf8');
      summaryPath = summaryPathLocal;
    } catch (err) {
      writeErr = err;
      // eslint-disable-next-line no-console
      console.warn('Could not write axe summary file:', (err as any)?.message ?? err);
    }

    if (summaryPath) {
      throw new Error(
        `Accessibility violations (impact >= ${threshold}): ${failing.length}. See ${summaryPath}`,
      );
    }

    throw new Error(
      `Accessibility violations (impact >= ${threshold}): ${
        failing.length
      }. Also failed to write summary file: ${(writeErr as any)?.message ?? writeErr}`,
    );
  }
}
export default { runAxeAnalysis, checkA11y };
