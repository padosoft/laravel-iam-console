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
- **Super-admin = all `iam:*` grants.** There is NO wildcard in the PDP. `SuperAdminSeeder` grants the first
  user every `iam:*` permission the Admin API declares (direct permission grants; no catalog row needed).
  Credentials via env: `IAM_SUPERADMIN_EMAIL` / `IAM_SUPERADMIN_PASSWORD` / `IAM_SUPERADMIN_NAME`.
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

## Ecosystem docs
Full documentation: https://doc.laravel-iam-server.padosoft.com (and each package's `doc.<pkg>.padosoft.com`).
