<?php

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\ResetUserPassword;
use App\Actions\Fortify\UpdateUserPassword;
use App\Actions\Fortify\UpdateUserProfileInformation;
use App\Listeners\EndIamSession;
use App\Listeners\RecordLoginFailed;
use App\Listeners\RecordLoginSucceeded;
use App\Listeners\RecordStepUpFailed;
use App\Listeners\StartIamSession;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Fortify\Actions\RedirectIfTwoFactorAuthenticatable;
use Laravel\Fortify\Events\TwoFactorAuthenticationFailed;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Fortify::createUsersUsing(CreateNewUser::class);
        Fortify::updateUserProfileInformationUsing(UpdateUserProfileInformation::class);
        Fortify::updateUserPasswordsUsing(UpdateUserPassword::class);
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::redirectUserForTwoFactorAuthenticationUsing(RedirectIfTwoFactorAuthenticatable::class);

        // Open a server-side IAM session (iam_sessions) when the operator logs in, so the Sessions screen
        // shows the current session and OIDC /authorize can rely on a live IdP login; revoke it on logout.
        Event::listen(Login::class, StartIamSession::class);
        Event::listen(Logout::class, EndIamSession::class);

        // Audit login activity so GET /metrics/users can surface it on the Dashboard.
        Event::listen(Login::class, RecordLoginSucceeded::class);
        Event::listen(Failed::class, RecordLoginFailed::class);
        Event::listen(TwoFactorAuthenticationFailed::class, RecordStepUpFailed::class);

        // Login screen for the admin console (Blade). After login Fortify redirects to `home`
        // (config/fortify.php → /console) where the React SPA takes over.
        Fortify::loginView(fn () => view('auth.login'));

        // Password reset (Features::resetPasswords() is enabled in config/fortify.php). The reset link is
        // emailed via the configured MAIL_MAILER — set it to smtp (with credentials) on deploy.
        Fortify::requestPasswordResetLinkView(fn () => view('auth.forgot-password'));
        Fortify::resetPasswordView(fn (Request $request) => view('auth.reset-password', ['request' => $request]));

        // Fortify does not throttle the reset-link request/update routes by default; cap them to blunt
        // reset-email spam and token probing (6/min per IP). Applied once routes are registered.
        $this->app->booted(function (): void {
            foreach ($this->app->make('router')->getRoutes()->getRoutes() as $route) {
                if (in_array($route->getName(), ['password.email', 'password.update'], true)) {
                    $route->middleware('throttle:6,1');
                }
            }
        });

        RateLimiter::for('login', function (Request $request) {
            $throttleKey = Str::transliterate(Str::lower($request->input(Fortify::username())).'|'.$request->ip());

            return Limit::perMinute(5)->by($throttleKey);
        });

        RateLimiter::for('two-factor', function (Request $request) {
            return Limit::perMinute(5)->by($request->session()->get('login.id'));
        });
    }
}
