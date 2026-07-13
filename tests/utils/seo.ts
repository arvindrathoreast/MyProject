// Helper to write SEO check results for aggregation
import fs from 'fs';
import path from 'path';

export interface SeoResult {
  url: string;
  has_title: boolean;
  has_meta_description: boolean;
  canonical: string | null;
  robots_index: boolean;
  sitemap_present: boolean;
}

export function writeSeoResult(result: SeoResult): void {
  try {
    const outDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let urlSlug = result.url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
    if (!urlSlug || urlSlug === '_') urlSlug = 'root';
    const filename = `${outDir}/seo-results-${urlSlug}-${ts}.json`;

    fs.writeFileSync(filename, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Wrote SEO results to ${filename}`);
  } catch (e) {
    console.warn('Could not write SEO results:', (e as Error)?.message ?? e);
  }
}
