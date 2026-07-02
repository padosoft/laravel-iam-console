<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Auth\Events\Login;
use Padosoft\Iam\Domain\Audit\Pii\AuditRecorder;

/**
 * Emit an `auth.login.succeeded` audit event on operator login. This is the source the Admin API's
 * GET /metrics/users derives its login activity from (succeeded count + last_login_at), so the console
 * Dashboard can show it. Best-effort: an audit hiccup must never break login.
 */
class RecordLoginSucceeded
{
    public function __construct(private readonly AuditRecorder $audit) {}

    public function handle(Login $event): void
    {
        // Only explicit sign-ins (POST /login), not remember-me recaller re-auth that fires Login on
        // ordinary requests — otherwise the metric's login count would include cookie-restored sessions.
        if (! $event->user instanceof User || request()->path() !== 'login') {
            return;
        }

        try {
            $id = (string) $event->user->getAuthIdentifier();
            $this->audit->record([
                'stream' => 'auth',
                'event_type' => 'auth.login.succeeded',
                'target_type' => 'user',
                'target_id' => $id,
                'actor_user_id' => $id, // the actor of a login IS the user (populates the audit Actor column)
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
