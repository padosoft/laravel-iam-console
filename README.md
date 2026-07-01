<p align="center">
  <img src="art/banner.png" alt="Laravel IAM" width="100%">
</p>

<h1 align="center">Laravel IAM — Console</h1>

<p align="center">
  <strong>Your own Identity &amp; Authorization control plane — and a web console to run it — deployable in minutes.</strong><br>
  One Laravel 13 app that installs the entire Laravel IAM ecosystem and ships a React admin console to
  manage users, roles &amp; grants, sessions, audit, access reviews, AI anomaly recommendations and apps.
</p>

<p align="center">
  <a href="https://github.com/padosoft/laravel-iam-console/actions"><img src="https://img.shields.io/github/actions/workflow/status/padosoft/laravel-iam-console/tests.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <img src="https://img.shields.io/badge/Laravel-13.x-FF2D20?style=flat-square" alt="Laravel 13">
  <img src="https://img.shields.io/badge/PHP-8.3%2B-777BB4?style=flat-square" alt="PHP 8.3+">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square" alt="Vite 8">
  <img src="https://img.shields.io/badge/deploy-Laravel%20Cloud-6875F5?style=flat-square" alt="Laravel Cloud">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
</p>

<p align="center">
  📚 <b><a href="https://doc.laravel-iam-server.padosoft.com">Full ecosystem docs</a></b> &nbsp;·&nbsp;
  🚀 <a href="https://doc.laravel-iam-server.padosoft.com/tutorial">Zero-to-working tutorial</a> &nbsp;·&nbsp;
  ☁️ <a href="https://doc.laravel-iam-server.padosoft.com/tutorial/09-deploy-on-laravel-cloud">Deploy on Laravel Cloud</a>
</p>

---

## Table of contents

- [What this is](#what-this-is)
- [What it's for](#what-its-for)
- [What's inside](#whats-inside)
  - [The web admin console (screen by screen)](#the-web-admin-console-screen-by-screen)
  - [The backend](#the-backend)
- [Requirements](#requirements)
- [Set it up locally (step by step)](#set-it-up-locally-step-by-step)
- [First steps after login](#first-steps-after-login)
- [Deploy on Laravel Cloud (step by step)](#deploy-on-laravel-cloud-step-by-step)
- [Connect your apps](#connect-your-apps)
- [How it works (architecture)](#how-it-works-architecture)
- [Configuration reference](#configuration-reference)
- [The ecosystem](#the-ecosystem)
- [License](#license)

---

## What this is

`laravel-iam-console` is the **deployable host application** for [Laravel IAM](https://github.com/padosoft) —
an open-source, self-hosted **Identity &amp; Authorization control plane** for Laravel.

`laravel-iam-server` is a *package*, not an app: you can't deploy it directly. **This repo is the app that
installs it** — pre-wired with every IAM package, a login backend, a super-admin seeder, and a **web admin
console** on top. Clone it, point it at a database, deploy it, seed a super-admin, and you have a running IAM
server with a UI. Your other applications then install
[`padosoft/laravel-iam-client`](https://github.com/padosoft/laravel-iam-client) and ask this server for
authorization decisions.

## What it's for

- **Run your own IAM/IdP** instead of a SaaS: identity, RBAC + ABAC + ReBAC authorization, OAuth2/OIDC,
  tamper-evident audit, and governance — hosted by you, owned by you.
- **Manage it from a browser**: create users, assign roles &amp; permissions, review sessions, read the audit
  trail, run access-review campaigns, and see AI least-privilege/anomaly recommendations — no CLI required.
- **Authorize every app you own** against one control plane: PHP apps via `laravel-iam-client`, and Node /
  React Native / Rust apps via the [official SDKs](#the-ecosystem).

## What's inside

### The web admin console (screen by screen)

A React 19 + Vite 8 + Tailwind 4 single-page app (`resources/console`), served by the app behind login. Every
screen talks **only** to the server's real Admin API (`/api/iam/v1`) — nothing is faked.

| Screen | What you do there |
| --- | --- |
| **Dashboard** | At-a-glance metrics (decisions, grants) and recent activity. |
| **Users** | List &amp; search users, open a user to see **effective permissions**, **create a user**, **suspend / reactivate**, and revoke all their sessions. |
| **Roles &amp; Grants** | Assign a **permission or role** to a user with the policy wizard — **preview the impact** (who's affected, conflicts) then **commit** a `permit` / `deny` grant. |
| **Sessions** | List active sessions and **revoke** them individually. |
| **Audit log** | Browse audit events and **verify the tamper-evident hash-chain** on demand. |
| **Access reviews** | Create certification **campaigns**, open/close them, and **certify or revoke** each access item. |
| **Recommendations** | **AI &amp; least-privilege** findings — unused grants, over-privileged subjects (advisory, draft-only). |
| **Applications** | The registered applications and their manifests. |
| **Decision playground** | Ask the PDP a **`check` / `explain`** and see the real ALLOW/DENY + the reasoning. |

> **Note on user creation.** The IAM Admin API intentionally does **not** create users (identities come from
> your app's auth / OIDC / directory). The console owns user creation via a small app endpoint
> (`POST /api/console/users`), gated by the `iam:users.manage` permission; everything else is the real Admin API.

### The backend

Installed and wired for you in one Laravel 13 app:

- **[laravel-iam-server](https://packagist.org/packages/padosoft/laravel-iam-server)** — identity, PDP
  (RBAC + ABAC + ReBAC), Application Registry + manifests, OAuth2/OIDC, tamper-evident audit, governance/IGA,
  and the **Admin API**.
- **[laravel-iam-client](https://packagist.org/packages/padosoft/laravel-iam-client)** — `iam.auth` /
  `iam.can` middleware + Gate adapter (for in-app authorization).
- **[laravel-iam-ai](https://packagist.org/packages/padosoft/laravel-iam-ai)** — advisory-only AI governance
  (redaction + hallucination-guard + audit), disabled by default.
- **[laravel-iam-directory](https://packagist.org/packages/padosoft/laravel-iam-directory)** — optional
  LDAP/AD login + JIT provisioning.
- **[laravel-iam-bridge-spatie-permission](https://packagist.org/packages/padosoft/laravel-iam-bridge-spatie-permission)**
  — migration bridge from spatie/laravel-permission.
- **[laravel-iam-contracts](https://packagist.org/packages/padosoft/laravel-iam-contracts)** — shared
  interfaces &amp; DTOs (transitive).
- **[Laravel Fortify](https://laravel.com/docs/fortify)** — the web login backend for the IdP.
- **`SuperAdminSeeder`** — bootstraps the first super-admin (granted every `iam:*` permission).

## The console

<p align="center"><img src="art/screenshots/Dashboard-Dark.png" alt="Dashboard" width="100%"></p>

<table>
<tr>
<td width="50%"><img src="art/screenshots/Users-grants.png" alt="Users and grants"><br><em>Users &amp; grants — assign roles/permissions</em></td>
<td width="50%"><img src="art/screenshots/Session-e-token.png" alt="Sessions"><br><em>Sessions &amp; tokens — revoke live</em></td>
</tr>
<tr>
<td><img src="art/screenshots/Audit.png" alt="Audit log"><br><em>Tamper-evident audit log</em></td>
<td><img src="art/screenshots/Anomalies.png" alt="AI anomalies"><br><em>AI anomaly &amp; least-privilege recommendations</em></td>
</tr>
<tr>
<td><img src="art/screenshots/Access-reviews.png" alt="Access reviews"><br><em>Access review campaigns</em></td>
<td><img src="art/screenshots/Policy-Playground.png" alt="Decision playground"><br><em>Decision playground — check/explain</em></td>
</tr>
</table>

## Requirements

- **PHP 8.4+** (Laravel 13 requires Symfony 8 → PHP 8.4). The IAM packages themselves are 8.3+.
- **Composer 2**.
- **Node 20+** and npm (to build the console UI).
- **A database** — SQLite works out of the box for local; Postgres or MySQL for a real deployment.
- **No Redis, no S3 required** (see [How it works](#how-it-works-architecture)).

## Set it up locally (step by step)

```bash
# 1. Clone
git clone https://github.com/padosoft/laravel-iam-console
cd laravel-iam-console

# 2. Environment + app key
cp .env.example .env
composer install
php artisan key:generate
```

```bash
# 3. Create the schema (all iam_* tables) on SQLite by default
php artisan migrate
```

> ✅ You should see ~20 migrations run (`iam_core_tables`, `iam_signing_keys`, `iam_sessions`,
> `iam_audit_tables`, `iam_applications_and_manifests`, …).

```bash
# 4. Seed the first super-admin (reads IAM_SUPERADMIN_* from .env)
php artisan db:seed
```

> ✅ Output: `Super-admin ready: admin@example.com (… iam:* permissions granted).`
> The dev default is `admin@example.com` / `password` — change `IAM_SUPERADMIN_PASSWORD` in `.env` first for
> anything non-local.

```bash
# 5. Build the console UI (or `npm --prefix resources/console run dev` for hot reload)
npm --prefix resources/console install
npm --prefix resources/console run build
```

> ✅ Emits `public/console/` (the built SPA). Without this, `/console` returns a "UI not built" hint.

```bash
# 6. Serve
php artisan serve
```

Open **<http://localhost:8000>** → you're redirected to the login → sign in as the super-admin → the console
opens. That's it.

## First steps after login

Do these once to see the whole thing working (this is exactly what the automated E2E test does):

1. **Register an application.** Go to **Applications** (or apply a manifest via
   `php artisan iam:manifest:apply <file> --approve`) to create an app + its permissions/roles catalog.
2. **Create a user.** **Users → Create user** (name, email, password).
3. **Assign access.** **Roles &amp; Grants** → pick the user, choose a permission or role (e.g.
   `warehouse:stock.adjust`), **Preview impact**, then **Commit grant**.
4. **Prove it.** **Decision playground** → `check` that user against the permission → **ALLOW**. Check a
   permission they don't hold → fail-closed **DENY**.
5. **Watch the trail.** **Audit log** → your changes are there; **Verify chain** confirms the hash-chain is intact.

## Deploy on Laravel Cloud (step by step)

You need only **an app + a database**. No Redis, no object storage.

1. **Push this repo to GitHub** (your fork/copy).
2. **Create a Laravel Cloud project** and connect the repository.
3. **Add a database** (Postgres or MySQL) in the project — Laravel Cloud injects the `DB_*` env.
4. **Set environment variables** (Project → Environment):
   ```dotenv
   APP_URL=https://your-iam.example.com
   IAM_ISSUER=https://your-iam.example.com
   IAM_KMS_DRIVER=local
   SESSION_DRIVER=database
   CACHE_STORE=database
   QUEUE_CONNECTION=database
   IAM_SUPERADMIN_EMAIL=you@example.com
   IAM_SUPERADMIN_PASSWORD=a-strong-password
   ```
5. **Set the deploy/build command** — build the console UI, migrate, and seed the super-admin:
   ```bash
   composer install --no-dev --optimize-autoloader
   npm --prefix resources/console install --no-audit --no-fund && npm --prefix resources/console run build
   php artisan migrate --force
   php artisan db:seed --class=SuperAdminSeeder --force
   ```
6. **Enable the scheduler** (a Laravel Cloud toggle) — it drives the only async work (audit checkpoints,
   webhook delivery, access-review reminders) and needs no Redis.
7. **Deploy, then sign in** at your URL as the super-admin. You now run IAM as a service, with a console.

## Connect your apps

Each **consuming app** installs the client and points at your server:

```bash
composer require padosoft/laravel-iam-client
```
```dotenv
IAM_CLIENT_MODE=http
IAM_CLIENT_BASE_URL=https://your-iam.example.com/api/iam/v1
IAM_CLIENT_APP=your-app-key
```
```php
Route::middleware(['iam.auth', 'iam.can:invoices.view'])->group(function () {
    Route::get('/invoices', InvoicesController::class);
});
```

Non-PHP apps use the [Node](https://www.npmjs.com/package/@padosoft/laravel-iam-node),
[React Native](https://www.npmjs.com/package/@padosoft/laravel-iam-react-native) or
[Rust](https://crates.io/crates/laravel-iam) SDK against the same server.

## How it works (architecture)

- **Session-authenticated Admin API.** The server can auto-register the Admin API under `/api/iam/v1` with
  Bearer auth; this app disables that (`config/iam.php` → `iam.admin.register_routes = false`) and re-serves
  the same routes under the `web` group. `App\Iam\SessionAdminActorResolver` resolves the Admin API actor from
  the operator's **Fortify session**, so the console calls the API same-origin with the session cookie — no
  browser tokens. Authorization is unchanged: every route still asks the PDP via `iam.can`, fail-closed.
- **Super-admin = all `iam:*` grants.** There is no wildcard in the PDP, so `SuperAdminSeeder` grants the first
  user every `iam:*` permission the Admin API declares. Manage further users/roles from the console.
- **Database-only infrastructure.** `SESSION/CACHE/QUEUE=database`; ES256 signing keys are generated and
  stored in `iam_signing_keys` (`IAM_KMS_DRIVER=local`, KEK derived from `APP_KEY`). Add Redis/KMS only at scale.
- **Passkeys are deferred.** `laravel/passkeys` isn't installable on Laravel 13 yet (its
  `web-auth/webauthn-lib` pins `symfony/clock ^6|^7` while Laravel 13 ships Symfony 8). Fortify
  (username/password) is the login backend until upstream supports Symfony 8.

See [`CLAUDE.md`](CLAUDE.md) and [`.claude/skills/iam-console-dev`](.claude/skills/iam-console-dev/SKILL.md) for
the developer-facing details, and [`.claude/rules/rule-ship-workflow.md`](.claude/rules/rule-ship-workflow.md)
for the CI/ship workflow (local-green → PR → Copilot → `testE2E` label → E2E CI).

## Configuration reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `IAM_ISSUER` | `APP_URL` | OAuth/OIDC token issuer — set to your public URL in production. |
| `IAM_KMS_DRIVER` | `local` | Signing/envelope key storage. `local` keeps keys in the DB (no external service). |
| `IAM_ADMIN_AUDIENCE` | *(empty)* | Only needed if you also expose the Admin API to Bearer-token clients. |
| `IAM_SUPERADMIN_NAME` / `_EMAIL` / `_PASSWORD` | `Super Admin` / `admin@example.com` / `password` | The first super-admin created by the seeder. **Change before deploying.** |
| `SESSION_DRIVER` / `CACHE_STORE` / `QUEUE_CONNECTION` | `database` | No Redis required. |
| `IAM_AI_ENABLED` / `IAM_AI_PROVIDER` | `false` / `disabled` | Advisory-only AI. Real sovereign transports **`regolo`** (EU) and **`ollama`** (on-prem) ship in laravel-iam-ai; set `IAM_AI_BASE_URL` (+ `IAM_AI_API_KEY` for Regolo) to enable. Fail-safe otherwise. |
| `IAM_TRACER` | `null` | Observability: `null` \| `log` \| `otlp` (native OpenTelemetry push to `IAM_OTEL_ENDPOINT`) \| `stack` (both). |

## The ecosystem

This app is the host; the rest of Laravel IAM plugs into or consumes it. Every package has its own docs site:

- **Server & modules (Packagist):** [server](https://doc.laravel-iam-server.padosoft.com) ·
  [client](https://doc.laravel-iam-client.padosoft.com) · [ai](https://doc.laravel-iam-ai.padosoft.com) ·
  [directory](https://doc.laravel-iam-directory.padosoft.com) ·
  [bridge-spatie-permission](https://doc.laravel-iam-bridge-spatie-permission.padosoft.com) ·
  [contracts](https://doc.laravel-iam-contracts.padosoft.com)
- **Client SDKs:** [node](https://doc.laravel-iam-node.padosoft.com) ·
  [react-native](https://doc.laravel-iam-react-native.padosoft.com) ·
  [rust](https://doc.laravel-iam-rust.padosoft.com)

## License

MIT © [Padosoft](https://www.padosoft.com). Part of the [Laravel IAM](https://github.com/padosoft) ecosystem.
