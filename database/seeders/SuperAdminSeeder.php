<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Padosoft\Iam\Domain\Authorization\Models\Grant;

/**
 * Bootstraps the first super-admin: the account you log in with to run the whole console.
 *
 * There is no wildcard permission in the PDP, so a "super-admin" is a user granted every `iam:*`
 * permission the Admin API declares. We grant them directly (the proven pattern — a permission grant
 * matches by key and needs no catalog row). Idempotent: safe to re-run.
 *
 * Credentials come from env (with dev defaults) so a deploy can set them without editing code:
 *   IAM_SUPERADMIN_NAME, IAM_SUPERADMIN_EMAIL, IAM_SUPERADMIN_PASSWORD
 */
class SuperAdminSeeder extends Seeder
{
    /**
     * Every permission the Admin API routes require (vendor .../routes/admin.php). A super-admin holds
     * all of them. Keep in sync if the server adds Admin API surface (the E2E test will catch drift).
     *
     * @var list<string>
     */
    private const IAM_PERMISSIONS = [
        'iam:access_request.review',
        'iam:access_request.use',
        'iam:access_review.manage',
        'iam:applications.read',
        'iam:audit.read',
        'iam:decisions.check',
        'iam:decisions.explain',
        'iam:directory.manage',
        'iam:directory.read',
        'iam:federated.manage',
        'iam:federated.read',
        'iam:grants.manage',
        'iam:groups.manage',
        'iam:groups.read',
        'iam:least_privilege.view',
        'iam:manifests.apply',
        'iam:manifests.approve',
        'iam:manifests.read',
        'iam:manifests.submit',
        'iam:metrics.read',
        'iam:policies.read',
        'iam:relations.manage',
        'iam:sessions.manage',
        'iam:sessions.read',
        'iam:users.manage',
        'iam:users.read',
        'iam:webhooks.manage',
        'iam:webhooks.read',
    ];

    public function run(): void
    {
        $email = (string) env('IAM_SUPERADMIN_EMAIL', 'admin@example.com');
        $name = (string) env('IAM_SUPERADMIN_NAME', 'Super Admin');
        $password = (string) env('IAM_SUPERADMIN_PASSWORD', 'password');

        $user = User::query()->firstOrCreate(
            ['email' => $email],
            ['name' => $name, 'password' => Hash::make($password)],
        );

        foreach (self::IAM_PERMISSIONS as $permission) {
            Grant::query()->firstOrCreate(
                [
                    'subject_type' => 'user',
                    'subject_id' => (string) $user->getKey(),
                    'privilege_type' => 'permission',
                    'privilege_key' => $permission,
                    'effect' => 'permit',
                ],
                ['valid_from' => now(), 'source' => 'super-admin-seeder'],
            );
        }

        $this->command?->info("Super-admin ready: {$email} (".count(self::IAM_PERMISSIONS).' iam:* permissions granted).');
        if ($password === 'password') {
            $this->command?->warn('Using the default dev password "password" — set IAM_SUPERADMIN_PASSWORD before deploying.');
        }
    }
}
