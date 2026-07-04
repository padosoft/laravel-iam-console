<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Support\Facades\Log;
use Laravel\Fortify\Events\TwoFactorAuthenticationConfirmed;
use Padosoft\Iam\Domain\Audit\Pii\AuditRecorder;

/**
 * Audit `auth.2fa.enabled` when an operator confirms (activates) TOTP two-factor. Fortify fires
 * TwoFactorAuthenticationConfirmed only after the user verifies a code, i.e. 2FA is actually live — the
 * right moment to record, unlike the earlier "generated but unconfirmed" step. Best-effort.
 */
class RecordTwoFactorEnabled
{
    public function __construct(private readonly AuditRecorder $audit) {}

    public function handle(TwoFactorAuthenticationConfirmed $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        try {
            $id = (string) $event->user->getAuthIdentifier();
            $this->audit->record([
                'stream' => 'auth',
                'event_type' => 'auth.2fa.enabled',
                'target_type' => 'user',
                'target_id' => $id,
                'actor_user_id' => $id,
            ]);
        } catch (\Throwable $e) {
            Log::warning('audit auth.2fa.enabled failed', ['exception' => $e]);
        }
    }
}
