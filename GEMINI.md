# Project Overview

This is a test automation project using Playwright for end-to-end, accessibility, visual regression, and performance testing.

**Key Technologies:**

- **Testing Framework:** [Playwright](https://playwright.dev/)
- **Language:** TypeScript
- **Package Manager:** npm
- **CI/CD:** GitHub Actions

**Project Structure:**

- `tests/`: Contains all the test specifications.
  - `a11y/`: Accessibility tests using `@axe-core/playwright`.
  - `e2e/`: End-to-end tests.
  - `perf/`: Performance tests using Lighthouse.
  - `visual/`: Visual regression tests.
- `scripts/`: Contains helper scripts, such as running Lighthouse audits.
- `playwright.config.ts`: Playwright configuration file.
- `.github/workflows/ci.yml`: GitHub Actions workflow for continuous integration.

# Building and Running

**1. Install Dependencies:**

```bash
npm install
```

**2. Install Playwright Browsers:**

```bash
npx playwright install
```

**3. Run Tests:**

- **Run all tests:**
  ```bash
  npm test
  ```
- **Run specific test suites:**

  ```bash
  # End-to-end tests
  npm run test:e2e

  # Accessibility tests
  npm run test:a11y

  # Visual regression tests
  npm run test:visual

  # Performance tests (Lighthouse)
  npm run test:perf

  # SEO tests
  npm run test:seo
  ```

# Development Conventions

- **Base URL:** The base URL for the application under test is configured in `playwright.config.ts` and can be overridden by the `BASE_URL` environment variable.
- **Tests:** New tests should be added to the appropriate subdirectory under `tests/`.
- **CI:** The GitHub Actions workflow in `.github/workflows/ci.yml` is triggered on every push and pull request to the `main` branch. It runs all the tests and uploads the test reports as artifacts.
