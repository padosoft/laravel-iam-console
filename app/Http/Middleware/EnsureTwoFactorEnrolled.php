<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mandatory console 2FA (opt-in via IAM_CONSOLE_2FA_REQUIRED). When enforcement is on, an operator who has
 * not yet CONFIRMED TOTP two-factor is blocked from the API until they enrol — so a newly-created user
 * (e.g. marco) is forced to set up 2FA on first use instead of it being optional per person.
 *
 * Applied only to the API groups (not the SPA shell or the Fortify 2FA-setup routes), and `/api/user` is
 * exempt so the SPA can still fetch whoami, see `two_factor_required`, and route the operator to enrolment.
 */
class EnsureTwoFactorEnrolled
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('fortify.iam_two_factor_required') !== true) {
            return $next($request);
        }

        $user = $request->user();
        // Not authenticated, already enrolled, or the whoami call → let it through.
        if ($user === null || $user->getAttribute('two_factor_confirmed_at') !== null || $request->is('api/user')) {
            return $next($request);
        }

        // Fail-closed: block the operator from doing anything else until 2FA is confirmed. The SPA reads the
        // `two_factor_required` flag and renders the enrolment (Security) screen.
        return response()->json([
            'message' => 'Two-factor authentication is required. Enrol before continuing.',
            'two_factor_required' => true,
        ], 403);
    }
}
