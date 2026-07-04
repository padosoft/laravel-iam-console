<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Support\Facades\Log;
use Laravel\Fortify\Events\TwoFactorAuthenticationDisabled;
use Padosoft\Iam\Domain\Audit\Pii\AuditRecorder;

/**
 * Audit `auth.2fa.disabled` when an operator turns off TOTP two-factor — a security-relevant downgrade
 * that must be traceable in the audit log. Best-effort: never let an audit hiccup break the request.
 */
class RecordTwoFactorDisabled
{
    public function __construct(private readonly AuditRecorder $audit) {}

    public function handle(TwoFactorAuthenticationDisabled $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        try {
            $id = (string) $event->user->getAuthIdentifier();
            $this->audit->record([
                'stream' => 'auth',
                'event_type' => 'auth.2fa.disabled',
                'target_type' => 'user',
                'target_id' => $id,
                'actor_user_id' => $id,
            ]);
        } catch (\Throwable $e) {
            Log::warning('audit auth.2fa.disabled failed', ['exception' => $e]);
        }
    }
}
