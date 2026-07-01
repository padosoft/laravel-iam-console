<?php

declare(strict_types=1);

namespace App\Iam;

use Illuminate\Http\Request;
use Padosoft\Iam\Contracts\Support\SubjectRef;
use Padosoft\Iam\Http\Admin\Support\AdminContext;
use Padosoft\Iam\Http\Admin\Support\AdminActorResolver;

/**
 * Bundled-console actor resolver.
 *
 * The default {@see \Padosoft\Iam\Http\Admin\Support\TokenAdminActorResolver} authenticates the Admin
 * API with a Bearer access token. In this single-app console the operator is already authenticated by
 * the app's own web session (Laravel Fortify), so we resolve the Admin API actor from the logged-in
 * user instead — no token juggling. Authorization is unchanged: every Admin API route still asks the
 * PDP (`iam.can:<permission>`) whether this actor may act, fail-closed. A super-admin is simply a user
 * who has been granted the `iam:*` permissions (see database/seeders/SuperAdminSeeder).
 *
 * Fail-closed: no authenticated user → null → the middleware answers 401.
 */
final class SessionAdminActorResolver implements AdminActorResolver
{
    public function resolve(Request $request): ?AdminContext
    {
        $user = $request->user();
        if ($user === null) {
            return null;
        }

        return new AdminContext(
            actor: new SubjectRef('user', (string) $user->getAuthIdentifier()),
            // Single-tenant console: no org binding. The PDP treats null as the global scope.
            organizationId: null,
            // The session actor is trusted for the full admin surface; the PDP still gates each action.
            scopes: ['*'],
        );
    }
}
