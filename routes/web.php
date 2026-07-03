<?php

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Padosoft\Iam\Ai\Modules\AccessExplainer;
use Padosoft\Iam\Contracts\Authorization\AuthorizationEngine;

// Landing → the console (Fortify redirects unauthenticated users to /login).
Route::get('/', fn () => redirect('/console'));

/*
|--------------------------------------------------------------------------
| Admin API (session-authenticated, for the bundled console SPA)
|--------------------------------------------------------------------------
|
| The server package can auto-register the Admin API under `api/iam/v1` with
| Bearer-token auth. We disabled that (config/iam.php → iam.admin.register_routes
| = false) and re-register the very same routes here, inside the `web` group, so
| they run with the session + CSRF stack. That lets the console SPA call the Admin
| API using the operator's Fortify session (see App\Iam\SessionAdminActorResolver)
| — no token handling in the browser. Authorization is unchanged: every route still
| declares `iam.can:<permission>` and the PDP decides, fail-closed.
|
| Non-GET calls require the X-XSRF-TOKEN header (Laravel's standard SPA CSRF); the
| SPA's HTTP client reads it from the XSRF-TOKEN cookie automatically.
|
*/
Route::prefix(config('iam.admin.route_prefix', 'api/iam/v1'))
    ->middleware(['auth', 'iam.session_active', 'iam.admin_auth', 'iam.idempotency'])
    ->group(base_path('vendor/padosoft/laravel-iam-server/routes/admin.php'));

/*
|--------------------------------------------------------------------------
| Console app endpoints (session-authed, not part of the IAM Admin API)
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'iam.session_active'])->group(function () {
    // Current operator (for the topbar identity). No Admin API "whoami" exists; the SPA probes this
    // same-origin, session-authed route so it can show the operator's name instead of a generic label.
    Route::get('/api/user', fn (Request $request) => response()->json([
        'id' => (string) $request->user()->getAuthIdentifier(),
        'name' => $request->user()->name,
        'email' => $request->user()->email,
    ]));

    // Create a local user. The IAM Admin API does NOT create users (users come from the app's own
    // auth); the console owns user creation, then grants are assigned via the Admin API policy wizard.
    // Requires the operator to be permitted to manage users (PDP), mirroring the Admin API surface.
    Route::post('/api/console/users', function (Request $request) {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:iam_users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $actor = ['type' => 'user', 'id' => (string) $request->user()->getAuthIdentifier()];
        $decision = app(AuthorizationEngine::class)
            ->check(['subject' => $actor, 'permission' => 'iam:users.manage']);
        abort_unless(($decision['allowed'] ?? false) === true, 403, 'iam:users.manage denied');

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        return response()->json(['data' => ['id' => (string) $user->getKey(), 'name' => $user->name, 'email' => $user->email]], 201);
    });

    // AI explain (advisory): natural-language reasoning over a PDP decision, via the AI module
    // (AccessExplainer → configured provider, e.g. regolo) with redaction + hallucination-guard. The AI
    // never decides — it re-phrases the PDP's own explanation. Always safe: if AI is disabled or the
    // provider errors/hallucinates, it returns the deterministic explanation. Gated by iam:decisions.explain.
    Route::post('/api/console/ai-explain', function (Request $request) {
        $data = $request->validate([
            'subject' => ['required', 'array'],
            'subject.type' => ['required', 'string', 'max:64'],
            'subject.id' => ['required', 'string', 'max:255'],
            'permission' => ['required', 'string', 'max:255'],
            'application' => ['nullable', 'string', 'max:255'],
            'question' => ['nullable', 'string', 'max:500'],
        ]);

        $actor = ['type' => 'user', 'id' => (string) $request->user()->getAuthIdentifier()];
        $engine = app(AuthorizationEngine::class);
        abort_unless(($engine->check(['subject' => $actor, 'permission' => 'iam:decisions.explain'])['allowed'] ?? false) === true, 403, 'iam:decisions.explain denied');

        $decision = $engine->check([
            'subject' => ['type' => $data['subject']['type'], 'id' => $data['subject']['id']],
            'permission' => $data['permission'],
            'application' => $data['application'] ?? null,
        ]);

        $advisory = app(AccessExplainer::class)->explain($decision, is_string($data['question'] ?? null) ? $data['question'] : '');

        return response()->json(['data' => $advisory->toArray()]);
    })->middleware('throttle:20,1'); // each call is a (billable) external LLM request when AI is enabled

    // Serve the built React SPA for every /console route (client-side routing). `npm run build`
    // (in resources/console) emits public/console/index.html + assets.
    Route::get('/console/{any?}', function () {
        $index = public_path('console/index.html');
        abort_unless(is_file($index), 503, 'Console UI not built. Run: npm --prefix resources/console run build');

        return response()->file($index);
    })->where('any', '.*');
});
