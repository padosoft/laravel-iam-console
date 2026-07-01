import { defineConfig, devices } from '@playwright/test'

/**
 * E2E for the Laravel IAM Console — the golden path (see .claude/rules/rule-ship-workflow.md):
 * login → visit every console screen → create a user → assign a role and a permission.
 *
 * Before running, the app must be migrated + seeded and the SPA built:
 *   php artisan migrate:fresh --seed --force
 *   npm --prefix resources/console run build
 * The CI workflow (.github/workflows/e2e.yml) does this; locally, run those first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.APP_URL ?? 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'php artisan serve --host=127.0.0.1 --port=8000',
    url: 'http://127.0.0.1:8000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
