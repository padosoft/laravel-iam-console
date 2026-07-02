<?php

namespace App\Listeners;

use App\Models\User;
use Laravel\Fortify\Events\TwoFactorAuthenticationFailed;
use Padosoft\Iam\Domain\Audit\Pii\AuditRecorder;

/**
 * Emit an `auth.stepup.failed` audit event when a two-factor challenge code is rejected. Fortify fires
 * TwoFactorAuthenticationFailed on an invalid 2FA code (TwoFactorAuthenticatedSessionController), which
 * is the clean hook. This feeds the step-up-failed count in GET /metrics/users on the Dashboard.
 * Best-effort: an audit hiccup must never break the challenge flow.
 */
class RecordStepUpFailed
{
    public function __construct(private readonly AuditRecorder $audit) {}

    public function handle(TwoFactorAuthenticationFailed $event): void
    {
        try {
            $this->audit->record([
                'stream' => 'auth',
                'event_type' => 'auth.stepup.failed',
                'target_type' => 'user',
                'target_id' => $event->user instanceof User ? (string) $event->user->getAuthIdentifier() : null,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
