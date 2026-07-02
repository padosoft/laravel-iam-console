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
        if (! $event->user instanceof User) {
            return;
        }

        try {
            $this->audit->record([
                'stream' => 'auth',
                'event_type' => 'auth.login.succeeded',
                'target_type' => 'user',
                'target_id' => (string) $event->user->getAuthIdentifier(),
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
