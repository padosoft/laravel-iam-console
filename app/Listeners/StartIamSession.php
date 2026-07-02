<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Auth\Events\Login;
use Padosoft\Iam\Domain\Identity\Session\SessionStarter;

/**
 * On a successful Fortify login, open the operator's server-side IAM session (a row in `iam_sessions`)
 * and stash its `iam_sid` in the Laravel session. The server package ships the session lifecycle but
 * leaves the login wiring to the host ("M5.4/deploy") — this is that wiring. It's what makes the console
 * Sessions screen show the current operator and lets OIDC /authorize rely on a live IdP session.
 *
 * Requires the auth model to be keyed on `iam_users` (Option C): `iam_sessions.user_id` FKs `iam_users`.
 */
class StartIamSession
{
    public function __construct(private readonly SessionStarter $starter) {}

    public function handle(Login $event): void
    {
        // Only our operator accounts open an IAM session; ignore any other guard/model.
        if (! $event->user instanceof User) {
            return;
        }

        $this->starter->start((string) $event->user->getAuthIdentifier(), request());
    }
}
