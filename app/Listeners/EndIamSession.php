<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Auth\Events\Logout;
use Padosoft\Iam\Contracts\Identity\SessionRegistry;
use Padosoft\Iam\Domain\Audit\Pii\AuditRecorder;

/**
 * On logout, revoke the operator's server-side IAM session (the one StartIamSession opened) so it stops
 * showing as live on the Sessions screen and can no longer back an OIDC /authorize, and record an
 * `auth.logout` audit event (login/logout are both auditable, feeding the Audit log). Without this the
 * `iam_sessions` rows opened at login would accumulate with `revoked_at = null`.
 */
class EndIamSession
{
    public function __construct(
        private readonly SessionRegistry $registry,
        private readonly AuditRecorder $audit,
    ) {}

    public function handle(Logout $event): void
    {
        $request = request();
        if (! $request->hasSession()) {
            return;
        }

        $sid = $request->session()->get('iam_sid');
        if (! is_string($sid) || $sid === '') {
            return;
        }

        try {
            $this->registry->revokeSession($sid, 'logout');

            $actor = $event->user instanceof User ? (string) $event->user->getAuthIdentifier() : null;
            $this->audit->record([
                'stream' => 'auth',
                'event_type' => 'auth.logout',
                'target_type' => 'user',
                'target_id' => $actor,
                'actor_user_id' => $actor,
            ]);
        } catch (\Throwable $e) {
            report($e); // both revocation and audit are best-effort; never let them break logout.
        }
        $request->session()->forget('iam_sid');
    }
}
