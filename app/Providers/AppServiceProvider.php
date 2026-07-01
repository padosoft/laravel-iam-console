<?php

namespace App\Providers;

use App\Iam\SessionAdminActorResolver;
use Illuminate\Routing\Router;
use Illuminate\Support\ServiceProvider;
use Padosoft\Iam\Http\Admin\Middleware\AdminAuthenticate;
use Padosoft\Iam\Http\Admin\Middleware\AuthorizeIamPermission;
use Padosoft\Iam\Http\Admin\Middleware\IdempotencyKey;
use Padosoft\Iam\Http\Admin\Support\AdminActorResolver;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Authenticate the Admin API from the console's own web session (Fortify) instead of a
        // Bearer token. App providers register after package providers, so this rebind wins over the
        // server's default TokenAdminActorResolver.
        $this->app->bind(AdminActorResolver::class, SessionAdminActorResolver::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // The server package's admin middleware aliases are only registered when it auto-registers the
        // admin routes (iam.admin.register_routes). We disabled that (config/iam.php) so we can serve the
        // Admin API under the `web` group for session auth (routes/web.php), so we register the aliases
        // here. `iam.can` is bound to the SERVER's AuthorizeIamPermission (not the client's IamCan) —
        // app providers boot last, so this wins any alias the client package may have claimed.
        /** @var Router $router */
        $router = $this->app->make('router');
        $router->aliasMiddleware('iam.admin_auth', AdminAuthenticate::class);
        $router->aliasMiddleware('iam.can', AuthorizeIamPermission::class);
        $router->aliasMiddleware('iam.idempotency', IdempotencyKey::class);
    }
}
