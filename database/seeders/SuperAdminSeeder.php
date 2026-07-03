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
 * Super-admin = a user granted the `iam-admin` role, which expands (via the seeded catalog + pivot) to
 * every `iam:*` permission the Admin API declares. There is no wildcard in the PDP — `iam-admin` is an
 * explicit role→permissions mapping (see IamRolesSeeder). Using a single role grant (instead of many
 * direct permission grants) keeps the Users list and Access Reviews readable. Idempotent.
 *
 * Credentials come from env (with dev defaults):
 *   IAM_SUPERADMIN_NAME, IAM_SUPERADMIN_EMAIL, IAM_SUPERADMIN_PASSWORD
 */
class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        // The iam-admin role (and the iam:* catalog it expands through) must exist before we grant it.
        $this->call(IamRolesSeeder::class);

        $email = (string) env('IAM_SUPERADMIN_EMAIL', 'admin@example.com');
        $name = (string) env('IAM_SUPERADMIN_NAME', 'Super Admin');
        $password = (string) env('IAM_SUPERADMIN_PASSWORD', 'password');

        $user = User::query()->firstOrCreate(
            ['email' => $email],
            ['name' => $name, 'password' => Hash::make($password)],
        );

        Grant::query()->firstOrCreate(
            [
                'subject_type' => 'user',
                'subject_id' => (string) $user->getKey(),
                'privilege_type' => 'role',
                'privilege_key' => 'iam:iam-admin',
                'effect' => 'permit',
            ],
            ['valid_from' => now(), 'source' => 'super-admin-seeder'],
        );

        $this->command?->info("Super-admin ready: {$email} (iam-admin role).");
        if ($password === 'password') {
            $this->command?->warn('Using the default dev password "password" — set IAM_SUPERADMIN_PASSWORD before deploying.');
        }
    }
}
