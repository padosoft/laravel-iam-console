<?php

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;

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
    ->middleware(['auth', 'iam.admin_auth', 'iam.idempotency'])
    ->group(base_path('vendor/padosoft/laravel-iam-server/routes/admin.php'));

/*
|--------------------------------------------------------------------------
| Console app endpoints (session-authed, not part of the IAM Admin API)
|--------------------------------------------------------------------------
*/
Route::middleware('auth')->group(function () {
    // Create a local user. The IAM Admin API does NOT create users (users come from the app's own
    // auth); the console owns user creation, then grants are assigned via the Admin API policy wizard.
    // Requires the operator to be permitted to manage users (PDP), mirroring the Admin API surface.
    Route::post('/api/console/users', function (Request $request) {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $actor = ['type' => 'user', 'id' => (string) $request->user()->getAuthIdentifier()];
        $decision = app(\Padosoft\Iam\Contracts\Authorization\AuthorizationEngine::class)
            ->check(['subject' => $actor, 'permission' => 'iam:users.manage']);
        abort_unless(($decision['allowed'] ?? false) === true, 403, 'iam:users.manage denied');

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        return response()->json(['data' => ['id' => (string) $user->getKey(), 'name' => $user->name, 'email' => $user->email]], 201);
    });

    // Serve the built React SPA for every /console route (client-side routing). `npm run build`
    // (in resources/console) emits public/console/index.html + assets.
    Route::get('/console/{any?}', function () {
        $index = public_path('console/index.html');
        abort_unless(is_file($index), 503, 'Console UI not built. Run: npm --prefix resources/console run build');

        return response()->file($index);
    })->where('any', '.*');
});
