# CLAUDE.md — laravel-iam-console

Deployable **host application** for the Laravel IAM ecosystem: a single Laravel 13 app that installs
**every** IAM package and ships a **web admin console** to manage users, roles/grants, sessions, audit log,
access reviews, AI recommendations/anomalies and applications. This is what you deploy (e.g. on Laravel Cloud)
to run your own IAM server; consuming apps separately install `padosoft/laravel-iam-client`.

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
- **Passkeys deferred.** `laravel/passkeys` is not installable on Laravel 13 yet (its `web-auth/webauthn-lib`
  pins `symfony/clock ^6|^7`, Laravel 13 ships Symfony 8). Fortify only until upstream supports Symfony 8.
- **Deploy = database + compute only.** No Redis / S3 required: `SESSION/CACHE/QUEUE=database`,
  `IAM_KMS_DRIVER=local` (ES256 signing keys auto-generated in `iam_signing_keys`), scheduler ON for
  async audit/webhook/review jobs.

## The admin console SPA
- `resources/console/` — React (latest) + Vite (latest) + Tailwind SPA, built into `public/`, served by a
  catch-all web route behind Fortify auth. It talks ONLY to the real Admin API (`/api/iam/v1`, see the
  server's `resources/openapi.yaml` — the contract; never invent endpoints).
- Screens: dashboard, users, roles & grants, sessions, audit log, access reviews, AI recommendations, apps.

## Commands
- `php artisan migrate` — creates the full `iam_*` schema.
- `php artisan db:seed --class=SuperAdminSeeder` — bootstrap the super-admin.
- SPA: `npm --prefix resources/console run dev` (dev), `... run build` (prod build into `public/`).
- E2E: `npx playwright test` (starts app + seed, logs in, clicks every screen, creates a user + assigns a
  role/permission). This is the regression guarantee — keep it green.

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
