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
  'Security',
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

  // 4b) Multi-tenancy: create an org + a group in it; then a SECOND org with a group of the SAME key.
  // Deleting one must hit the right group (groups are addressed by id, not the org-scoped key). Unique
  // per-run names keep the test idempotent across Playwright retries (which don't re-seed the DB).
  const s = Date.now()
  const org1 = `E2E Org ${s}`
  const org2 = `E2E Org Two ${s}`
  const teamKey = `e2e-team-${s}` // shared across the two orgs (same-key coexistence)
  const team1 = `E2E Team ${s}`
  const team2 = `E2E Team Two ${s}`

  async function createOrg(name: string) {
    await page.getByRole('link', { name: 'Organizations', exact: true }).click()
    await page.getByRole('button', { name: 'New organization' }).click()
    await page.getByPlaceholder('acme', { exact: true }).fill(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    await page.getByPlaceholder('Acme Inc', { exact: true }).fill(name)
    const [r] = await Promise.all([
      page.waitForResponse((x) => /\/organizations$/.test(x.url()) && x.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create', exact: true }).click(),
    ])
    expect(r.status()).toBe(201)
  }

  async function createGroup(orgName: string, groupName: string) {
    await page.getByRole('link', { name: 'Groups', exact: true }).click()
    await page.getByRole('button', { name: 'New group' }).click()
    await page.getByLabel('Group organization').fill(orgName)
    // The option label also carries the org key as a hint, so match by substring (the fill already
    // filtered the list to this org) rather than exact.
    await page.getByRole('option', { name: orgName }).first().click()
    await page.getByPlaceholder('engineering', { exact: true }).fill(teamKey)
    await page.getByPlaceholder('Engineering', { exact: true }).fill(groupName)
    const [r] = await Promise.all([
      page.waitForResponse((x) => /\/groups$/.test(x.url()) && x.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create', exact: true }).click(),
    ])
    expect(r.status()).toBe(201)
  }

  await createOrg(org1)
  await createGroup(org1, team1)
  await createOrg(org2)
  await createGroup(org2, team2)

  // Both same-key groups coexist.
  await expect(page.getByRole('cell', { name: teamKey, exact: true })).toHaveCount(2)

  // Delete the SECOND org's group; the first (same key, other org) must survive — proves id-addressing.
  await Promise.all([
    page.waitForResponse((x) => /\/groups\/[^/]+$/.test(x.url()) && x.request().method() === 'DELETE'),
    page.locator('tr', { hasText: team2 }).getByRole('button', { name: 'Delete' }).click(),
  ])
  await expect(page.getByText(team2)).toHaveCount(0)
  await expect(page.getByText(team1)).toBeVisible()

  // 4d) Onboarding: register a new app via manifest → approve → apply → see client_id + one-time secret.
  await page.getByRole('link', { name: 'Applications', exact: true }).click()
  await page.getByRole('button', { name: 'Register / update app' }).click()
  const appKey = `e2e-app-${s}`
  await page.locator('textarea').fill(JSON.stringify({
    schema: 'laravel-iam.manifest.v2',
    app: { key: appKey, name: 'E2E App', type: 'laravel', risk_level: 'low' },
    auth: { client_type: 'confidential', redirect_uris: ['https://e2e.example.com/callback'] },
    permissions: [{ key: 'thing.read', resource: 'thing', action: 'read', risk: 'low' }],
    roles: [{ key: 'viewer', label: 'Viewer', permissions: ['thing.read'] }],
  }))
  await Promise.all([
    page.waitForResponse((x) => /\/manifests$/.test(x.url()) && x.request().method() === 'POST'),
    page.getByRole('button', { name: 'Submit manifest' }).click(),
  ])
  // The submitted manifest renders with an Approve (sensitive change) or Apply (auto-approved) button.
  await expect(page.getByRole('button', { name: /^(Approve|Apply)$/ })).toBeVisible()
  if (await page.getByRole('button', { name: 'Approve' }).isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForResponse((x) => /\/approve$/.test(x.url()) && x.request().method() === 'POST'),
      page.getByRole('button', { name: 'Approve' }).click(),
    ])
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible()
  }
  await Promise.all([
    page.waitForResponse((x) => /\/apply$/.test(x.url()) && x.request().method() === 'POST'),
    page.getByRole('button', { name: 'Apply' }).click(),
  ])
  await expect(page.getByText(`cli_${appKey}`)).toBeVisible() // client_id shown
  await expect(page.getByText('client_secret', { exact: true })).toBeVisible() // one-time secret revealed
  await page.getByRole('button', { name: 'Done' }).click() // close the onboarding modal

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
  await page.locator('[role="dialog"]').getByRole('button', { name: 'Close' }).click() // close the review modal

  // 7) The onboarded app's OAuth client secret can be rotated with zero downtime (new secret shown once).
  await page.getByRole('link', { name: 'Applications', exact: true }).click()
  await page.locator('tr', { hasText: appKey }).getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('button', { name: 'Rotate secret' })).toBeVisible()
  await Promise.all([
    page.waitForResponse((x) => /\/rotate-secret$/.test(x.url()) && x.request().method() === 'POST'),
    page.getByRole('button', { name: 'Rotate secret' }).click(),
  ])
  await expect(page.getByText('new client_secret')).toBeVisible()
})
