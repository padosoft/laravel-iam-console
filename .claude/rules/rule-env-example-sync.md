# Rule: keep `.env.example` in sync with every env variable change (MANDATORY)

This rule is **binding** for every change in this ecosystem. `.env.example` is the contract a deployer reads
to configure the app; if it drifts from the code, deploys silently miss (or misconfigure) features.

## The rule

Whenever you **add, rename, remove, or change the meaning/default/units** of an environment variable — in
**any** consumed package config (`config/*.php` `env(...)` calls), a service provider, `bootstrap/app.php`,
a Blade/route, or anywhere `env('IAM_...')` / `process.env` / `std::env` is read — you MUST, in the **same
change/PR**, update `.env.example` (the deployable app's, i.e. `laravel-iam-console/.env.example`) to match:

::: steps
1. **Add** a new var → add it to `.env.example` under the right section, with a one-line comment: purpose,
   allowed values, default, and **units** (say "in SECONDS" for any `*_TTL` / `*_GRACE` / timeout).
2. **Remove/rename** a var → remove/rename it in `.env.example` too (no orphans, no stale names).
3. **Change** a default, allowed-values set, or units → update the comment/value so it's never misleading
   (e.g. a mode hint must list the exact strings the code checks — `full | hash | none`, not `plain`).
4. **Opt-in features off by default**: ship them commented or set to the safe default (`false`/empty), so a
   fresh `.env` is secure and inert until explicitly enabled.
:::

## Non-negotiables
- A PR that touches env handling but not `.env.example` is **incomplete** — do not open/merge it.
- The comment must state **units** for durations and the **exact** allowed values the code branches on.
- If a var lives in a package config but is consumed by the console, it still gets documented in the
  console `.env.example` (that's the file a deployer edits).
- Cross-check on every credential/security var (`IAM_OAUTH_*`, `IAM_AUDIT_*`, `IAM_CONSOLE_2FA`, `IAM_AI_*`):
  these gate real behavior; a missing/incorrect line is a deploy-time footgun.
