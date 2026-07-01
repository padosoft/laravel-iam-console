<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

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
