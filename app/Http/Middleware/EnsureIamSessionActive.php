<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Padosoft\Iam\Contracts\Identity\SessionRef;
use Padosoft\Iam\Contracts\Identity\SessionRegistry;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforces the server-side IAM session on every authenticated web request. The console auth is a Fortify
 * cookie session (table `sessions`); the IdP session lives separately in `iam_sessions` (opened at login,
 * its id stashed as `iam_sid`). Without this bridge, revoking an `iam_sessions` row — from the Sessions
 * screen or an admin — would NOT log the operator out, because the Fortify cookie is untouched.
 *
 * On each request, if the stashed `iam_sid` is no longer active (revoked, idle-timed-out, or past its
 * absolute expiry per SessionRegistry::active), we tear down the Fortify session too (401 for XHR — the
 * SPA bounces to /login — or a redirect for a document request). Otherwise we `touch()` it to keep the
 * idle window alive while the operator is working. Sessions with no `iam_sid` (e.g. pre-wiring) pass through.
 */
class EnsureIamSessionActive
{
    public function __construct(private readonly SessionRegistry $registry) {}

    public function handle(Request $request, Closure $next): Response
    {
        $sid = $request->hasSession() ? $request->session()->get('iam_sid') : null;

        if (is_string($sid) && $sid !== '') {
            if (! $this->registry->active($sid)) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                return $request->expectsJson()
                    ? response()->json(['message' => 'Session revoked'], 401)
                    : redirect('/login');
            }

            // Active: extend the IdP session's idle window for this activity.
            $this->registry->touch(new SessionRef($sid));
        }

        return $next($request);
    }
}
