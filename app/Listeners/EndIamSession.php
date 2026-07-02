<?php

namespace App\Listeners;

use Illuminate\Auth\Events\Logout;
use Padosoft\Iam\Contracts\Identity\SessionRegistry;

/**
 * On logout, revoke the operator's server-side IAM session (the one StartIamSession opened) so it stops
 * showing as live on the Sessions screen and can no longer back an OIDC /authorize. Without this the
 * `iam_sessions` rows opened at login would accumulate with `revoked_at = null` forever.
 */
class EndIamSession
{
    public function __construct(private readonly SessionRegistry $registry) {}

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
        } catch (\Throwable $e) {
            report($e); // revocation is best-effort; never let it break logout.
        }
        $request->session()->forget('iam_sid');
    }
}
