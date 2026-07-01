---
name: iam-console-dev
description: Use when developing, extending, testing or deploying the laravel-iam-console host app — the deployable Laravel app that installs every Laravel IAM package and serves the React admin console. Covers the session-auth Admin API wiring, the super-admin seeder, the SPA under resources/console, the Playwright E2E, and the label-gated ship workflow.
---

# iam-console-dev

`laravel-iam-console` is the **deployable IAM server host**: one Laravel 13 app that installs all
`padosoft/laravel-iam-*` packages and ships a React admin console. Read `CLAUDE.md` for the full picture; this
skill is the how-to.

## Architecture you must respect
- **Session-auth Admin API** (not Bearer): `config/iam.php` sets `iam.admin.register_routes = false`; the
  Admin API is re-registered in `routes/web.php` under the `web` group; `App\Iam\SessionAdminActorResolver`
  (bound in `AppServiceProvider`) resolves the actor from the Fortify session. The PDP still gates every route
  via `iam.can:<permission>`, fail-closed. `iam.can` is rebound to the server's `AuthorizeIamPermission`.
- **Super-admin** = a user granted every `iam:*` permission (no PDP wildcard). `SuperAdminSeeder` does this;
  creds from `IAM_SUPERADMIN_*` env.
- **SPA** in `resources/console/` (React + Vite + Tailwind), built into `public/`, talks ONLY to the real
  Admin API. The contract is the server's `resources/openapi.yaml` — **never invent endpoints**; grep the
  vendored `routes/admin.php` / openapi to confirm a path, method and payload before wiring a screen.
- **Passkeys** deferred (Laravel 13 / Symfony 8 incompatibility upstream); Fortify only.
- **Deploy** needs only compute + database (Postgres/MySQL). No Redis/S3: `SESSION/CACHE/QUEUE=database`,
  `IAM_KMS_DRIVER=local`, scheduler ON.

## Run it
```bash
php artisan migrate
php artisan db:seed --class=SuperAdminSeeder
php artisan serve                 # backend + built SPA
npm --prefix resources/console run dev    # SPA dev server (hot reload)
```

## Add a console screen (the accurate way)
1. Find the real endpoint(s) in `vendor/padosoft/laravel-iam-server/routes/admin.php` + `resources/openapi.yaml`.
2. Build the screen in `resources/console/` against that exact contract; the API is same-origin session-authed,
   so send `X-XSRF-TOKEN` on non-GET calls.
3. Register the screen in the SPA router and the nav.
4. **Extend the Playwright E2E** to visit the new screen (the golden path must stay complete).

## Testing & shipping
- Local green gate: `php artisan test`, Pint/PHPStan, SPA build+lint, and `npx playwright test` (the E2E:
  boot + seed → login → click every screen → create a user → assign a role + permission).
- Then follow `.claude/rules/rule-ship-workflow.md`: PR → `copilot -p` rounds WITHOUT CI (never
  `--autopilot --yolo`) → when Copilot is quiet add the **`testE2E`** label → E2E CI → fix until green → merge.

## Docs
Ecosystem docs: https://doc.laravel-iam-server.padosoft.com. Keep this app's README and the server's
`tutorial/` in sync when the setup/deploy story changes.
