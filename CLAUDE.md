# CLAUDE.md — laravel-iam-console

Deployable **host application** for the Laravel IAM ecosystem: a single Laravel 13 app that installs
**every** IAM package and ships a **web admin console** to manage users, roles/grants, organizations &
groups, sessions, audit log, access reviews, least-privilege recommendations, applications and a decision
playground (with AI explanations). This is what you deploy (e.g. on Laravel Cloud) to run your own IAM
server; consuming apps separately install `padosoft/laravel-iam-client`.

## What's installed (all first-party padosoft/laravel-iam-*)
- `laravel-iam-server` — the IdP + PDP + OAuth/OIDC + audit + governance + **Admin API** (`/api/iam/v1`).
- `laravel-iam-client` — deciders + `iam.auth`/`iam.can` + Gate adapter (for in-app authorization).
- `laravel-iam-ai` — advisory-only AI governance (redaction + hallucination-guard + audit).
- `laravel-iam-directory` — LDAP/AD login + JIT provisioning (LdapRecord adapter optional).
- `laravel-iam-bridge-spatie-permission` — migration bridge from spatie/laravel-permission.
- `laravel-iam-contracts` — shared interfaces/DTOs (transitive).
- `laravel/fortify` — web login backend for the IdP.

## Architecture decisions (do not silently change)
- **Session-authenticated Admin API.** The server can auto-register the Admin API under `api/iam/v1` with
  Bearer auth; we DISABLE that (`config/iam.php` → `iam.admin.register_routes = false`) and re-register the
  same routes in `routes/web.php` under the `web` group. `App\Iam\SessionAdminActorResolver` (bound over the
  server's `AdminActorResolver` in `AppServiceProvider`) resolves the Admin API actor from the Fortify web
  session, so the SPA calls the API same-origin with the session cookie (no browser token handling).
  Authorization is unchanged: every route still declares `iam.can:<permission>` and the PDP decides,
  fail-closed. Non-GET SPA calls send `X-XSRF-TOKEN` (standard Laravel SPA CSRF).
- **`iam.can` alias** is rebound to the SERVER's `AuthorizeIamPermission` in `AppServiceProvider::boot()`
  (app providers boot last, beating the client package's `IamCan`). The admin routes need the server one.
- **Super-admin = the `iam-admin` role.** There is NO wildcard in the PDP. `IamRolesSeeder` seeds the
  `iam:*` permission catalog (`iam_permissions`) + default roles (`iam-admin` = every `iam:*`, plus
  `iam-auditor`, `user-manager`) with their `role_permissions` pivots; `SuperAdminSeeder` then grants the
  first user the single **`iam:iam-admin` role grant** (which expands to all `iam:*` via the catalog — a
  role, not a wildcard). A role grant only expands if the catalog rows exist, so the seeder order matters
  (a `ConsoleTest` drift-guard asserts the role covers the whole Admin API surface). Credentials via env:
  `IAM_SUPERADMIN_EMAIL` / `IAM_SUPERADMIN_PASSWORD` / `IAM_SUPERADMIN_NAME`.
- **Revoking a session logs you out.** `App\Http\Middleware\EnsureIamSessionActive` (on the `auth` groups)
  checks the stashed `iam_sid` against the server `SessionRegistry` each request: a revoked/idle/expired
  IdP session tears down the Fortify session (401 → SPA bounces to `/login`); active ones are `touch`ed.
- **Multi-tenancy (Organizations & Groups).** Orgs are first-class tenants (`iam_organizations`); groups
  (`iam_groups`) are org-scoped subjects you can grant to. The console super-admin is **global** (no org in
  context) so it sees/manages all tenants; a tenant-scoped actor is confined to its own org (cross-tenant →
  404). Because group keys are unique only per-org, the console always addresses a group by its **id**, never
  its key. Group-create requires an `organization_id` (a global admin has no context org to default to). The
  server soft-deletes (org → `suspended`, group → revoked); the console hides revoked groups. `suspended` is
  an admin flag only — it does NOT stop the PDP from authorizing that org's grants.
- **Readable IP/UA for forensics (opt-in).** `iam.audit.ip_mode`/`ua_mode` = `hash` (default, privacy:
  salted HMAC via the shared `PrivacyMode`) | `full` (clear IP/UA for forensics, surfaced only to
  `sessions.read`/`audit.read`) | `none`. Sessions AND admin-audit honour it. `full` needs host **TrustProxies**
  configured or `request->ip()` is the load-balancer, not the client. Flipping the mode is not retroactive.
- **AI explanations are host-wired, not an Admin API endpoint.** `laravel-iam-ai` ships services, not routes.
  The console adds `POST /api/console/ai-explain` (session-authed, `iam.can:decisions.explain`, throttled)
  that runs the PDP decision then passes it to the AI `AccessExplainer` (configured provider, e.g. regolo,
  with redaction + hallucination-guard). Always safe: AI off / provider error / guard trip → deterministic
  PDP explanation. Enable with `IAM_AI_ENABLED=true` + provider env; the Decision playground shows it.
- **A few host-side routes complement the Admin API** (all in `routes/web.php`, session-authed): `GET /api/user`
  (whoami for the topbar identity — there is no Admin API whoami), `POST /api/console/users` (user creation —
  the Admin API doesn't create users), and `POST /api/console/ai-explain` (above).
- **Passkeys deferred.** `laravel/passkeys` is not installable on Laravel 13 yet (its `web-auth/webauthn-lib`
  pins `symfony/clock ^6|^7`, Laravel 13 ships Symfony 8). Fortify only until upstream supports Symfony 8.
- **Deploy = database + compute only.** No Redis / S3 required: `SESSION/CACHE/QUEUE=database`,
  `IAM_KMS_DRIVER=local` (ES256 signing keys auto-generated in `iam_signing_keys`), scheduler ON for
  async audit/webhook/review jobs.

## The admin console SPA
- `resources/console/` — React (latest) + Vite (latest) + Tailwind SPA, built into `public/`, served by a
  catch-all web route behind Fortify auth. It talks to the real Admin API (`/api/iam/v1`, see the server's
  `resources/openapi.yaml` — the contract; never invent endpoints) plus the few host-side `/api/console/*`
  and `/api/user` routes noted above.
- Screens: dashboard, users, roles & grants, organizations, groups, sessions, audit log, access reviews,
  recommendations (least-privilege), applications, decision playground (with "Explain with AI").
- Reusable searchable pickers (`SearchSelect` base): `UserPicker`, `PrivilegePicker`, `ApplicationPicker`,
  `OrganizationPicker`, `GroupPicker`, `SubjectPicker` (user/group/service_account). ULIDs in Sessions /
  Audit / reviews are resolved to name+email via the `useUserNames` hook.

## Commands
- `php artisan migrate` — creates the full `iam_*` schema.
- `php artisan db:seed --class=SuperAdminSeeder` — bootstrap the super-admin.
- SPA: `npm --prefix resources/console run dev` (dev), `... run build` (prod build into `public/`).
- E2E: `npx playwright test` (starts app + seed, logs in, clicks every screen, creates a user + assigns a
  role/permission, and creates two orgs with a same-key group to guard id-addressed group ops). This is the
  regression guarantee — keep it green.

## ⚠️ npm: always `npm install`, never `npm ci` (in CI and on the deploy platform)
The committed lockfiles are generated on Windows and OMIT Linux-only optional deps (`@emnapi/*`, from
Tailwind v4's `@tailwindcss/oxide` napi/wasm fallback). On a Linux runner `npm ci` fails its strict sync
check (`Missing: @emnapi/core@… from lock file`). Use **`npm install --no-audit --no-fund`** everywhere the
project builds on Linux — the CI workflows already do. **Laravel Cloud:** the deploy Build Command is set in
the dashboard (the repo README can't change it) — it MUST use
`npm --prefix resources/console install --no-audit --no-fund && npm --prefix resources/console run build`,
not `npm ci`. The committed `resources/console/package-lock.json` is kept **Linux-complete** so `npm ci`
also works on Linux deploys; if you ever regenerate it on Windows (which drops the `@emnapi/*` nodes), run
the **`relock` GitHub workflow** (`gh workflow run relock.yml`) to re-generate + commit it on Linux.

## Ecosystem docs
Full documentation: https://doc.laravel-iam-server.padosoft.com (and each package's `doc.<pkg>.padosoft.com`).
