<?php

namespace App\Listeners;

use Illuminate\Auth\Events\Failed;
use Padosoft\Iam\Domain\Audit\Pii\AuditRecorder;

/**
 * Emit an `auth.login.failed` audit event on a failed login attempt, feeding GET /metrics/users'
 * failed-login count on the Dashboard. Records only the countable event — no email/PII is stored
 * (the attempted address is not persisted). Best-effort: never let auditing break the auth flow.
 */
class RecordLoginFailed
{
    public function __construct(private readonly AuditRecorder $audit) {}

    public function handle(Failed $event): void
    {
        try {
            $this->audit->record([
                'stream' => 'auth',
                'event_type' => 'auth.login.failed',
                'target_type' => 'user',
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
