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
  'Organizations',
  'Groups',
  'Sessions',
  'Audit log',
  'Access reviews',
  'Recommendations',
  'Applications',
  'Decision playground',
]

test('login → every screen → create user → assign a permission', async ({ page }) => {
  // 1) Sign in (Fortify Blade login). The password-reset request page is reachable from here.
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('button', { name: 'Email password reset link' })).toBeVisible()

  await page.goto('/login')
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await Promise.all([page.waitForURL('**/console**'), page.click('button[type=submit]')])

  // The sidebar is the proof the operator is authenticated and the SPA mounted.
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
  // The Dashboard shows the user-metrics tile (GET /metrics/users) with the last-login timestamp
  // (the sign-in we just did is recorded as auth.login.succeeded and surfaced by the metric).
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
  await expect(page.getByText(/Most recent login:/)).toBeVisible()
  // The topbar shows the operator's real name (via /api/user), not the generic "Operator" fallback.
  await expect(page.getByText('Super Admin').first()).toBeVisible()

  // 2) Click through EVERY console screen; each must become the active route.
  for (const label of SCREENS) {
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
  }

  // 2b) The operator's own IdP session is opened at login (SessionRegistry wiring) and shows here.
  await page.getByRole('link', { name: 'Sessions', exact: true }).click()
  await expect(page.locator('table tbody tr').first()).toBeVisible()

  // 2c) Decision playground subject-type actually switches (regression: it used to snap back to 'user'),
  // and the "Explain with AI" action is wired.
  await page.getByRole('link', { name: 'Decision playground', exact: true }).click()
  await page.getByLabel('Subject type').selectOption('group')
  await expect(page.getByLabel('Subject type')).toHaveValue('group')
  await expect(page.getByRole('button', { name: 'Explain with AI' })).toBeVisible()

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

  // 4) Assign a permission to that user via the policy wizard (preview → commit). The subject and the
  // privilege are now picked from searchable comboboxes: type to search, then click the option.
  await page.getByRole('link', { name: 'Roles & Grants', exact: true }).click()
  expect(userId).toBeTruthy()
  await page.getByLabel('Grant subject user').fill(email)
  await page.getByText(email).click() // the matching user option (name + email)
  await page.getByLabel('Grant privilege').fill('audit.read')
  await page.getByText('iam:audit.read', { exact: true }).click() // a real catalog permission

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

  // 4b) Multi-tenancy: create an organization, then a group inside it (via the searchable org picker).
  await page.getByRole('link', { name: 'Organizations', exact: true }).click()
  await page.getByRole('button', { name: 'New organization' }).click()
  const orgKey = `e2e-org-${Date.now()}`
  await page.getByPlaceholder('acme', { exact: true }).fill(orgKey)
  await page.getByPlaceholder('Acme Inc', { exact: true }).fill('E2E Org')
  const [orgResp] = await Promise.all([
    page.waitForResponse((r) => /\/organizations$/.test(r.url()) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create', exact: true }).click(),
  ])
  expect(orgResp.status()).toBe(201)
  await expect(page.getByText(orgKey)).toBeVisible()

  await page.getByRole('link', { name: 'Groups', exact: true }).click()
  await page.getByRole('button', { name: 'New group' }).click()
  await page.getByLabel('Group organization').fill('E2E Org')
  await page.getByRole('option', { name: /E2E Org/ }).click()
  await page.getByPlaceholder('engineering', { exact: true }).fill('e2e-team')
  await page.getByPlaceholder('Engineering', { exact: true }).fill('E2E Team')
  const [grpResp] = await Promise.all([
    page.waitForResponse((r) => /\/groups$/.test(r.url()) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create', exact: true }).click(),
  ])
  expect(grpResp.status()).toBe(201)
  await expect(page.getByText('e2e-team')).toBeVisible()

  // 5) Audit log (auth stream by default) shows the login event.
  await page.getByRole('link', { name: 'Audit log', exact: true }).click()
  await expect(page.getByText('auth.login.succeeded').first()).toBeVisible()

  // 6) Access review: create → open → review. The subject resolves to a name, not a raw ULID.
  await page.getByRole('link', { name: 'Access reviews', exact: true }).click()
  await page.getByRole('button', { name: 'New campaign' }).click()
  await page.getByPlaceholder('Q3 access certification').fill('E2E review')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  // Wait for the open POST to materialize the items before opening the review (else it loads empty).
  await Promise.all([
    page.waitForResponse((r) => /access-reviews\/campaigns\/.+\/open/.test(r.url()) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Open' }).first().click(),
  ])
  await page.getByRole('button', { name: 'Review' }).first().click()
  await expect(page.getByText('Super Admin')).toBeVisible()
})
