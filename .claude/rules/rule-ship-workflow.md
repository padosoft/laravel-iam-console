# Rule: ship workflow — local-green → PR → Copilot loop (no CI) → label-gated E2E CI (BLOCKING)

This rule is **binding** for every change to `laravel-iam-console`. It exists so the expensive E2E CI runs
only when the code is already Copilot-clean, and so a future session knows exactly how to ship safely.

## The sequence — follow it in order

::: steps
1. **Green locally first.** Never open a PR on red. Before pushing, ALL of these must pass locally:
   - `php artisan test` (feature/unit)
   - `vendor/bin/pint --test` and `vendor/bin/phpstan analyse` (if configured)
   - `npm --prefix resources/console run build` (SPA builds) and its lint/typecheck
   - `npx playwright test` (the full E2E: boot + seed → login → click every screen → create a user →
     assign a role + a permission). **This E2E is the regression guarantee — it must be green.**
2. **Open the PR** from a `task/*` branch. Do NOT add the `testE2E` label yet.
3. **Copilot loop WITHOUT CI.** Run `copilot -p` review rounds (NEVER `--autopilot --yolo`). Address findings,
   push, re-review. Because the E2E CI is gated by a label (below), these rounds do NOT trigger CI — you
   iterate fast without waiting for or burning CI minutes.
4. **When Copilot has nothing left to say**, add the **`testE2E` label** to the PR. That — and only that —
   triggers the GitHub Actions E2E workflow (see `.github/workflows/e2e.yml`, `if: contains(labels, 'testE2E')`).
5. **Run CI and fix until green.** If the label-gated CI fails, fix, push, and let it re-run (the label stays
   on, so pushes now re-trigger CI). Repeat until green. Remove the label only if you need to go back to
   Copilot-only rounds.
6. **Merge only when the E2E CI is green** and Copilot is quiet.
:::

## Non-negotiables
- **Never** run `copilot --autopilot --yolo` (it edits/commits/pushes autonomously — it once pushed a
  regressed branch in this ecosystem). Advisory review only.
- **Never** weaken or skip the Playwright E2E to make CI pass. If the E2E breaks, the app broke — fix the app.
- The E2E must always cover the golden path end to end: **login → visit every console screen → create a user
  → assign a role and a permission → see the grant take effect**. If you add a screen, extend the E2E.
- Commit messages end with the standard `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer.

## Why label-gating
The E2E spins up the full app (all IAM packages + a browser). It's slow and costly. Gating it behind the
`testE2E` label lets you do many cheap Copilot rounds first and only pay for E2E once the diff is clean.
