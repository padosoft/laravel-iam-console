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

        // Event listeners are auto-registered by Laravel 11 from app/Listeners (by their handle() type-hint):
        //   Login → StartIamSession (opens the iam_sessions row) + RecordLoginSucceeded (audit for metrics)
        //   Logout → EndIamSession (revokes the IdP session + audits logout)
        //   Failed → RecordLoginFailed;  TwoFactorAuthenticationFailed → RecordStepUpFailed
        // Do NOT also register them here with Event::listen — that double-fires (e.g. two
        // auth.login.succeeded rows per login). A ConsoleTest asserts exactly one per login.

        // Login screen for the admin console (Blade). After login Fortify redirects to `home`
        // (config/fortify.php → /console) where the React SPA takes over.
        Fortify::loginView(fn () => view('auth.login'));

        // Password reset (Features::resetPasswords() is enabled in config/fortify.php). The reset link is
        // emailed via the configured MAIL_MAILER — set it to smtp (with credentials) on deploy.
        Fortify::requestPasswordResetLinkView(fn () => view('auth.forgot-password'));
        Fortify::resetPasswordView(fn (Request $request) => view('auth.reset-password', ['request' => $request]));

        // TOTP two-factor challenge (only reachable when IAM_CONSOLE_2FA enables the Fortify 2FA feature).
        Fortify::twoFactorChallengeView(fn () => view('auth.two-factor-challenge'));

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
