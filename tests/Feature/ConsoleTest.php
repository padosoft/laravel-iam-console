<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\SuperAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Fortify\Events\TwoFactorAuthenticationFailed;
use Padosoft\Iam\Contracts\Authorization\AuthorizationEngine;
use Padosoft\Iam\Domain\Audit\Models\AuditEvent;
use Padosoft\Iam\Domain\Identity\Models\Session as IamSession;
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

    public function test_super_admin_seeder_grants_all_iam_permissions(): void
    {
        $this->seed(SuperAdminSeeder::class);

        $user = User::where('email', 'admin@example.com')->firstOrFail();
        $engine = app(AuthorizationEngine::class);

        foreach (['iam:users.read', 'iam:grants.manage', 'iam:sessions.read', 'iam:audit.read'] as $permission) {
            $decision = $engine->check(['subject' => ['type' => 'user', 'id' => (string) $user->getKey()], 'permission' => $permission]);
            $this->assertTrue($decision['allowed'] ?? false, "super-admin should be allowed {$permission}");
        }

        // A permission the super-admin was NOT granted is denied (fail-closed).
        $denied = $engine->check(['subject' => ['type' => 'user', 'id' => (string) $user->getKey()], 'permission' => 'iam:does-not-exist']);
        $this->assertFalse($denied['allowed'] ?? false);
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
}
