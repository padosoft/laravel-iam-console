import { test, expect } from '@playwright/test'

/**
 * Golden path — the regression guarantee for the whole console (see
 * .claude/rules/rule-ship-workflow.md). If this breaks, the app broke.
 *
 * login → click every console screen → create a user → assign a permission to that user.
 *
 * Assumes a freshly migrated + seeded DB (php artisan migrate:fresh --seed) and a built SPA
 * (npm --prefix resources/console run build). The CI e2e workflow does both.
 */

const EMAIL = process.env.IAM_SUPERADMIN_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.IAM_SUPERADMIN_PASSWORD ?? 'password'

const SCREENS = [
  'Dashboard',
  'Users',
  'Roles & Grants',
  'Sessions',
  'Audit log',
  'Access reviews',
  'Recommendations',
  'Applications',
  'Decision playground',
]

test('login → every screen → create user → assign a permission', async ({ page }) => {
  // 1) Sign in (Fortify Blade login).
  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await Promise.all([page.waitForURL('**/console**'), page.click('button[type=submit]')])

  // The sidebar is the proof the operator is authenticated and the SPA mounted.
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()

  // 2) Click through EVERY console screen; each must become the active route.
  for (const label of SCREENS) {
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
  }

  // 2b) The operator's own IdP session is opened at login (SessionRegistry wiring) and shows here.
  await page.getByRole('link', { name: 'Sessions', exact: true }).click()
  await expect(page.locator('table tbody tr').first()).toBeVisible()

  // 3) Create a new user.
  await page.getByRole('link', { name: 'Users', exact: true }).click()
  const email = `ada+${Date.now()}@example.com`
  await page.getByRole('button', { name: 'Create user' }).click()
  await page.getByPlaceholder('Ada Lovelace').fill('Ada Lovelace')
  await page.getByPlaceholder('ada@example.com').fill(email)
  await page.locator('input[type=password]').fill('password1234')

  const [createResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/console/users') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create', exact: true }).click(),
  ])
  expect(createResp.status()).toBe(201)
  const userId = String(((await createResp.json()).data as { id: string }).id)
  expect(userId).toBeTruthy()

  // 4) Assign a permission to that user via the policy wizard (preview → commit). The subject is now
  // picked from the real user list (sourced from GET /users), so select the user we just created.
  await page.getByRole('link', { name: 'Roles & Grants', exact: true }).click()
  await page.getByLabel('Grant subject user').selectOption(userId)
  await page.getByPlaceholder('iam:users.read').fill('reports:view')

  const [previewResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('policies-wizard/preview')),
    page.getByRole('button', { name: 'Preview impact' }).click(),
  ])
  expect(previewResp.ok()).toBeTruthy()

  const [commitResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('policies-wizard/commit')),
    page.getByRole('button', { name: 'Commit grant' }).click(),
  ])
  expect(commitResp.ok()).toBeTruthy()
})
