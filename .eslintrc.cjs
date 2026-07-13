module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // Note: intentionally not using `parserOptions.project` to avoid
    // type-aware linting issues against multiple TypeScript versions in CI.
    // If you need type-aware rules, re-enable `project` and ensure
    // `@typescript-eslint` is upgraded to a version matching your TypeScript.
  },
  env: {
    node: true,
    es2022: true,
  },
  plugins: ['@typescript-eslint', 'import', 'playwright', 'node'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      node: { extensions: ['.js', '.ts', '.json'] },
      typescript: {},
    },
  },
  ignorePatterns: ['node_modules/', 'playwright-report/', 'lighthouse-report/', 'a11y-report/'],
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'import/order': ['warn', { 'newlines-between': 'always' }],
    'prefer-const': 'warn',
  },
  overrides: [
    {
      files: ['tests/**/*.ts', 'tests/**/*.js'],
      env: { node: true },
      extends: ['plugin:playwright/recommended'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        'import/no-unresolved': 'off',
        'import/default': 'off',
        'import/named': 'off',
      },
    },
    {
      files: ['tests/**/*.ts', 'tests/**/*.js'],
      rules: {
        'playwright/no-networkidle': 'off',
        'playwright/no-wait-for-timeout': 'off',
        'playwright/no-element-handle': 'off',
        'playwright/no-conditional-in-test': 'off',
        'playwright/no-conditional-expect': 'off',
        'playwright/expect-expect': 'off',
      },
    },
    {
      files: ['scripts/**/*.ts', 'scripts/**/*.js'],
      env: { node: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      files: ['*.config.js', 'scripts/**/*.js'],
      env: { node: true },
    },
  ],
};
