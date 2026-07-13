(The file `/Users/michael.smith/Projects/project-templates/testing-starter-repo/README.md` exists, but is empty)

# Testing Starter Repo (Playwright template)

This repository is a reusable Playwright testing starter that includes:

- End-to-end tests (E2E)
- Accessibility checks (axe)
- Visual regression (Playwright snapshots)
- Performance & SEO audits (Lighthouse)
- A CI workflow that uploads test artifacts for triage

This README explains how to run tests locally, update visual baselines, manage routes, add GA4 event checks, and how CI behaves.

**Prerequisites**

- Node.js (recommended LTS: 18 or 20)
- npm
- Playwright browsers (installed via `npx playwright install`)

## How to run

Install dependencies and Playwright browsers:

```bash
npm ci
npx playwright install
```

Run all Playwright tests:

```bash
npm test
```

Run a single suite (examples):

```bash
npm run test:e2e
npm run test:a11y
npm run test:visual
```

Run Lighthouse audits (writes output to `lighthouse-report/`):

```bash
npm run test:perf   # performance
npm run test:seo    # seo
```

Override the base URL at runtime:

```bash
BASE_URL=https://my-app.local npm run test:e2e
```

Notes:

- Playwright's `baseURL` is configured in `playwright.config.ts` and defaults to the `config/routes.json` `baseUrl` value when present.
- Playwright's HTML report is written to `playwright-report/` (Playwright config sets `open: 'never'`).

## How to update Visual Regression Test (VRT) baselines

This project uses Playwright snapshot-based visual tests. To update baselines:

1. Run the failing visual tests locally with the environment variable `UPDATE_BASELINE=1` (or use the Playwright CLI replace flag). Example:

```bash
UPDATE_BASELINE=1 npm run test:visual
```

2. Inspect the generated images in `tests/visual/__screenshots__` (or the folder where snapshots are stored).

3. Commit the updated snapshots to the repository. Make sure the changes reflect intentional UI updates.

Notes:

- We recommend running visual updates on a stable, deterministic environment (same browser version, same viewport, same OS) to avoid flakiness.
- If you prefer managed VRT, integrate a service such as Percy or Chromatic.

## How to add routes

The canonical route list and `baseUrl` are stored in `config/routes.json`. Tests use `tests/utils/routes.ts` to access routes.

To add or change routes:

1. Edit `config/routes.json`. Example structure:

```json
{
  "baseUrl": "https://staging.my-app.local",
  "routes": ["/", "/login", "/dashboard"]
}
```

2. Tests call `urlFor(index)` or `allRoutes()` from `tests/utils/routes.ts`. Add routes in `routes` array in the desired order; the template picks sample routes for some checks.

3. Run the relevant tests:

```bash
npm run test:seo
npm run test:sitemap
```

## How to add GA4 events (analytics tests)

Analytics tests are under `tests/analytics/ga4.spec.ts`. They validate:

- The GA4 script presence in the page
- `collect`/`g/collect` network calls (if network inspection is enabled)
- `dataLayer` pushes for `page_view` and custom events

To add new GA4 event checks:

1. Edit `tests/analytics/ga4.spec.ts` and add expectations for the custom events you want to assert. Example pattern:

```ts
// wait for dataLayer or network call
await page.waitForFunction(() => (window as any).dataLayer && (window as any).dataLayer.length > 0);
const pushes = await page.evaluate(() => (window as any).dataLayer || []);
expect(pushes.some((p) => p.event === 'your_custom_event')).toBeTruthy();
```

2. If you want to validate Measurement IDs, set them in `config/environments.json` or pass via `GA4_MEASUREMENT_ID` env var during CI runs.

3. Run analytics tests locally:

```bash
npm run test:analytics
```

Notes:

- Analytics test code can be forgiving — network timing differs in CI. Use conditional asserts or retries when necessary.
- Avoid sending test traffic to production analytics backends; prefer a staging measurement ID or mock the network endpoint.

## CI behavior explanation

Workflows live in `.github/workflows/`.

- `tests.yml` runs Playwright suites (E2E, a11y, visual, SEO, robots, sitemap, 404, security, analytics) on a matrix and conditionally runs Lighthouse perf on schedule or when requested.
- `lint.yml` runs ESLint and TypeScript typecheck (`npm run lint` and `npm run typecheck`).

Artifact locations and expectations:

- Playwright HTML reports: `playwright-report/` (uploaded as artifacts). The workflow currently uploads `playwright-report-${{ matrix.suite }}` as the artifact name.
- Lighthouse reports: `lighthouse-report/` (LHR JSON + HTML).
- Axe/a11y outputs: `a11y-report/` (JSON + summaries).

Artifact upload policy:

- By default the tests workflow uploads Playwright HTML reports only on failure to save space. If you want artifacts for every run (recommended for easy triage), change the upload step to `if: always()` in `.github/workflows/tests.yml`.

CI environment tips:

- Set `BASE_URL` or `GITHUB_ENV` variables in workflow dispatch or secrets when pointing at staging environments.
- For perf runs, prefer running on schedule (nightly) or on-demand via `workflow_dispatch` because Lighthouse is resource-intensive.
- Use `REPORTER_CHOICE` or workflow inputs to switch reporters between `github` (Actions) and `dot`/local when debugging locally.

## Troubleshooting

- If `npm install` fails due to dependency resolutions, try updating the offending package versions in `package.json` (we pinned compat versions for the template).
- If ESLint reports TypeScript parser warnings, align the `typescript` dependency to a version compatible with `@typescript-eslint` (the template suggests a supported range).

---

If you'd like, I can also:

- Add a dedicated `perf` job that runs nightly and always uploads `lighthouse-report/`.
- Add a short `CONTRIBUTING.md` with guidelines for updating visual baselines and approving snapshots.

Tell me which follow-up you'd like and I can apply it.
