<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Auto-rotate the OAuth client secrets that are due (opt-in per client via the manifest). Daily is enough:
// the cadence is per-client (rotate_interval_days) — this run just rotates whoever is due and clears
// pending ciphertexts whose grace has lapsed. Requires the deploy scheduler to be running (it is).
Schedule::command('iam:rotate-due-secrets')->daily();

// Session hygiene: mark idle/absolute-expired sessions as revoked and prune rows past the retention window
// (IAM_SESSION_RETENTION_DAYS) so iam_sessions doesn't grow unbounded. Daily is enough.
Schedule::command('iam:prune-sessions')->daily();
