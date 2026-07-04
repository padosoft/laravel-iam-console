<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\IamRolesSeeder;
use Database\Seeders\SuperAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Fortify\Events\TwoFactorAuthenticationConfirmed;
use Laravel\Fortify\Events\TwoFactorAuthenticationDisabled;
use Laravel\Fortify\Events\TwoFactorAuthenticationFailed;
use Padosoft\Iam\Contracts\Authorization\AuthorizationEngine;
use Padosoft\Iam\Domain\Audit\Models\AuditEvent;
use Padosoft\Iam\Domain\Authorization\Models\Grant;
use Padosoft\Iam\Domain\Identity\Models\Session as IamSession;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class ConsoleTest extends TestCase
{
    use RefreshDatabase;

    public function test_root_redirects_to_the_console(): void
    {
        $this->get('/')->assertRedirect('/console');
    }

    public function test_login_screen_renders(): void
    {
        $this->get('/login')->assertOk()->assertSee('Laravel IAM Console', false);
    }

    public function test_admin_api_is_unauthenticated_without_a_session(): void
    {
        // JSON request → 401 (fail-closed), not a redirect.
        $this->getJson('/api/iam/v1/users')->assertUnauthorized();
    }

    public function test_super_admin_is_allowed_every_iam_permission(): void
    {
        $this->seed(SuperAdminSeeder::class);

        $user = User::where('email', 'admin@example.com')->firstOrFail();
        $engine = app(AuthorizationEngine::class);

        // The iam-admin role must expand to EVERY declared iam:* permission — iterate the whole set so
        // dropping one from the seeder (or the role) fails here instead of silently stripping access.
        foreach (IamRolesSeeder::permissionFullKeys() as $permission) {
            $decision = $engine->check(['subject' => ['type' => 'user', 'id' => (string) $user->getKey()], 'permission' => $permission]);
            $this->assertTrue($decision['allowed'] ?? false, "super-admin should be allowed {$permission}");
        }

        // A permission the super-admin was NOT granted is denied (fail-closed).
        $denied = $engine->check(['subject' => ['type' => 'user', 'id' => (string) $user->getKey()], 'permission' => 'iam:does-not-exist']);
        $this->assertFalse($denied['allowed'] ?? false);
    }

    public function test_default_roles_cover_the_admin_api_permission_surface(): void
    {
        // Drift guard: every iam.can:iam:* the Admin API declares must be in the seeded catalog, else the
        // super-admin (who holds the role, not direct grants) silently loses that capability on a bump.
        $adminRoutes = (string) file_get_contents(base_path('vendor/padosoft/laravel-iam-server/routes/admin.php'));
        preg_match_all('/iam\.can:(iam:[a-z_]+\.[a-z_]+)/', $adminRoutes, $matches);
        $declared = array_values(array_unique($matches[1]));
        sort($declared);

        $seeded = IamRolesSeeder::permissionFullKeys();
        sort($seeded);

        $this->assertSame($declared, $seeded, 'IamRolesSeeder::PERMISSIONS drifted from the Admin API iam.can:iam:* surface.');
    }

    public function test_login_starts_an_iam_session_for_the_operator(): void
    {
        // Use a factory user (password 'password') so the test does not depend on the env-driven
        // super-admin password (IAM_SUPERADMIN_PASSWORD, e.g. from .env.example on CI).
        $user = User::factory()->create();

        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect('/console');

        // The Login listener opened a server-side IAM session for the operator (Sessions screen source).
        $this->assertTrue(
            IamSession::query()->where('user_id', $user->getKey())->whereNull('revoked_at')->exists(),
            'login should open an iam_sessions row for the operator',
        );
    }

    public function test_logout_revokes_the_operator_iam_session(): void
    {
        $user = User::factory()->create();

        $this->post('/login', ['email' => $user->email, 'password' => 'password']);
        $session = IamSession::query()->where('user_id', $user->getKey())->firstOrFail();
        $this->assertNull($session->revoked_at);

        $this->post('/logout');

        $this->assertNotNull($session->fresh()->revoked_at, 'logout should revoke the operator iam session');
    }

    public function test_login_activity_is_audited_for_the_users_metric(): void
    {
        $user = User::factory()->create();

        // A failed attempt, then a successful one — both feed GET /metrics/users' login activity.
        $this->post('/login', ['email' => $user->email, 'password' => 'wrong-password']);
        $this->post('/login', ['email' => $user->email, 'password' => 'password']);

        $this->assertTrue(
            AuditEvent::query()->where('event_type', 'auth.login.failed')->exists(),
            'a failed login should emit auth.login.failed',
        );
        $this->assertTrue(
            AuditEvent::query()->where('event_type', 'auth.login.succeeded')->exists(),
            'a successful login should emit auth.login.succeeded',
        );
        // Exactly one per login — Laravel 11 auto-registers app/Listeners, so an extra Event::listen
        // would double-record (regression guard for the duplicate audit-log entry).
        $this->assertSame(
            1,
            AuditEvent::query()->where('event_type', 'auth.login.succeeded')->count(),
            'a login must emit exactly ONE auth.login.succeeded (no double-registered listener)',
        );
    }

    public function test_mandatory_2fa_blocks_operators_until_they_enrol(): void
    {
        // Enforcement on (as if IAM_CONSOLE_2FA=true + IAM_CONSOLE_2FA_REQUIRED=true).
        config(['fortify.iam_two_factor_required' => true]);
        $this->seed(SuperAdminSeeder::class);
        $admin = User::where('email', 'admin@example.com')->firstOrFail();

        // Unenrolled operator → the Admin API is blocked with a clear two_factor_required signal…
        $this->actingAs($admin)->getJson('/api/iam/v1/users')
            ->assertStatus(403)
            ->assertJson(['two_factor_required' => true]);

        // …but whoami stays open so the SPA can react and route the operator to enrolment.
        $this->actingAs($admin)->getJson('/api/user')
            ->assertOk()
            ->assertJson(['two_factor_required' => true, 'two_factor_enabled' => false]);

        // Once TOTP is confirmed, the gate opens.
        $admin->forceFill(['two_factor_confirmed_at' => now()])->save();
        $this->actingAs($admin)->getJson('/api/iam/v1/users')->assertOk();
    }

    public function test_two_factor_enable_and_disable_are_audited(): void
    {
        $user = User::factory()->create();

        // Fortify fires Confirmed when 2FA goes live and Disabled when it is turned off. Both are
        // security-relevant and must be traceable (no listener existed before — they were never audited).
        event(new TwoFactorAuthenticationConfirmed($user));
        $this->assertTrue(
            AuditEvent::query()->where('event_type', 'auth.2fa.enabled')->exists(),
            'confirming 2FA should emit auth.2fa.enabled',
        );

        event(new TwoFactorAuthenticationDisabled($user));
        $this->assertTrue(
            AuditEvent::query()->where('event_type', 'auth.2fa.disabled')->exists(),
            'disabling 2FA should emit auth.2fa.disabled',
        );
    }

    public function test_step_up_failure_is_audited_for_the_users_metric(): void
    {
        $user = User::factory()->create();

        // Fortify fires this on a rejected 2FA challenge code; feeds metrics/users' step_up_failed.
        event(new TwoFactorAuthenticationFailed($user));

        $this->assertTrue(
            AuditEvent::query()->where('event_type', 'auth.stepup.failed')->exists(),
            'a rejected 2FA code should emit auth.stepup.failed',
        );
    }

    public function test_super_admin_holds_the_iam_admin_role(): void
    {
        $this->seed(SuperAdminSeeder::class);
        $user = User::where('email', 'admin@example.com')->firstOrFail();

        // Super-admin is now a single iam-admin ROLE grant (expands to every iam:* via the seeded catalog),
        // not 28 direct permission grants.
        $this->assertTrue(
            Grant::query()->where('subject_type', 'user')->where('subject_id', (string) $user->getKey())
                ->where('privilege_type', 'role')->where('privilege_key', 'iam:iam-admin')->exists(),
        );
        // The role still resolves to the permissions at the PDP.
        $engine = app(AuthorizationEngine::class);
        $decision = $engine->check(['subject' => ['type' => 'user', 'id' => (string) $user->getKey()], 'permission' => 'iam:users.read']);
        $this->assertTrue($decision['allowed'] ?? false);
    }

    public function test_revoked_iam_session_forces_logout_on_the_next_request(): void
    {
        $user = User::factory()->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect('/console');

        // Authenticated (no grants → 403, not 401): the IdP session is still active.
        $this->getJson('/api/iam/v1/users')->assertStatus(403);

        // Revoke the operator's IdP session (as the Sessions screen / an admin would).
        IamSession::query()->where('user_id', $user->getKey())->firstOrFail()->forceFill(['revoked_at' => now()])->save();

        // EnsureIamSessionActive now tears down the Fortify session → 401 (the SPA bounces to login).
        $this->getJson('/api/iam/v1/users')->assertStatus(401);
    }

    public function test_revoked_session_redirects_a_document_request_to_login(): void
    {
        $user = User::factory()->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'password']);
        IamSession::query()->where('user_id', $user->getKey())->firstOrFail()->forceFill(['revoked_at' => now()])->save();

        // A non-JSON request (SPA document load) on a dead session is redirected to /login.
        $this->get('/console')->assertRedirect('/login');
    }

    public function test_idle_iam_session_forces_logout(): void
    {
        $user = User::factory()->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'password']);

        // Past the idle window (30m default) with no activity → the IdP session is no longer active.
        $this->travel(31)->minutes();
        $this->getJson('/api/iam/v1/users')->assertStatus(401);
    }

    public function test_active_use_keeps_the_session_alive_past_the_idle_window(): void
    {
        $user = User::factory()->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'password']);

        // Activity within the window touches the session (extends last_activity_at)...
        $this->travel(20)->minutes();
        $this->getJson('/api/iam/v1/users')->assertStatus(403);

        // ...so 20 more minutes (40 since login, but 20 since the touch) is still inside the idle window.
        $this->travel(20)->minutes();
        $this->getJson('/api/iam/v1/users')->assertStatus(403);
    }

    public function test_two_factor_can_be_enabled_confirmed_and_challenges_login(): void
    {
        // IAM_CONSOLE_2FA=true in phpunit.xml registers the Fortify 2FA feature + routes.
        $user = User::factory()->create();
        $this->actingAs($user);

        // Enable → Fortify stores an (encrypted) secret + recovery codes, not yet confirmed.
        $this->postJson('/user/two-factor-authentication')->assertOk();
        $user->refresh();
        $this->assertNotNull($user->two_factor_secret);
        $this->assertNull($user->two_factor_confirmed_at);

        // Confirm with a valid TOTP derived from the secret.
        $secret = decrypt($user->two_factor_secret);
        $code = app(Google2FA::class)->getCurrentOtp($secret);
        $this->postJson('/user/confirmed-two-factor-authentication', ['code' => $code])->assertOk();
        $this->assertNotNull($user->refresh()->two_factor_confirmed_at);

        // whoami now reports 2FA enabled + that the console offers it.
        $this->getJson('/api/user')->assertOk()
            ->assertJsonPath('two_factor_enabled', true)
            ->assertJsonPath('console_2fa', true);

        // A fresh login is intercepted by the two-factor challenge instead of going straight to /console.
        auth('web')->logout();
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect('/two-factor-challenge');
    }

    public function test_whoami_returns_the_operator_identity(): void
    {
        $user = User::factory()->create(['name' => 'Grace Hopper']);
        $this->actingAs($user);

        $this->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('name', 'Grace Hopper')
            ->assertJsonPath('email', $user->email);
    }

    public function test_ai_explain_returns_a_deterministic_advisory_when_ai_disabled(): void
    {
        $user = User::factory()->create();
        Grant::query()->create([
            'subject_type' => 'user', 'subject_id' => (string) $user->getKey(),
            'privilege_type' => 'permission', 'privilege_key' => 'iam:decisions.explain',
        ]);
        $this->actingAs($user);

        $res = $this->postJson('/api/console/ai-explain', ['subject' => ['type' => 'user', 'id' => 'nobody'], 'permission' => 'warehouse:x']);

        // AI is disabled in tests → the module returns the deterministic explanation (never an error).
        $res->assertOk()
            ->assertJsonPath('data.advisory_only', true)
            ->assertJsonPath('data.ai_used', false);
        $this->assertNotEmpty($res->json('data.text'));
    }

    public function test_ai_explain_requires_the_decisions_explain_permission(): void
    {
        $this->actingAs(User::factory()->create()); // no grants

        $this->postJson('/api/console/ai-explain', ['subject' => ['type' => 'user', 'id' => 'x'], 'permission' => 'y'])
            ->assertStatus(403);
    }

    public function test_logout_is_audited(): void
    {
        $user = User::factory()->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'password']);

        $this->post('/logout');

        $this->assertTrue(
            AuditEvent::query()->where('event_type', 'auth.logout')->exists(),
            'logout should emit an auth.logout audit event',
        );
    }
}
