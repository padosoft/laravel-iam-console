<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Padosoft\Iam\Domain\Authorization\Models\Permission;
use Padosoft\Iam\Domain\Authorization\Models\Role;

/**
 * Seeds the console's own authorization catalog: the full `iam:*` permission set plus a few default
 * roles (with their role→permission pivots). Idempotent.
 *
 * Why the permission catalog matters: a ROLE grant only expands to a permission if the PDP finds a
 * non-deprecated `iam_permissions` row for it linked via `iam_role_permissions` (unlike a direct
 * permission grant, which matches on the key string alone). So default roles need these rows to exist.
 *
 * `full_key = "iam:{key}"`, matching the wizard catalog grouping (app_key = "iam").
 */
class IamRolesSeeder extends Seeder
{
    /**
     * The full `iam:*` permission surface (key part). Keep in sync with the Admin API middleware
     * (vendor routes/admin.php). The `iam-admin` role holds all of these.
     *
     * @var list<string>
     */
    private const PERMISSIONS = [
        'access_request.review', 'access_request.use', 'access_review.manage', 'applications.read',
        'audit.read', 'clients.manage', 'decisions.check', 'decisions.explain', 'directory.manage', 'directory.read',
        'federated.manage', 'federated.read', 'grants.manage', 'groups.manage', 'groups.read',
        'least_privilege.view', 'manifests.apply', 'manifests.approve', 'manifests.read', 'manifests.submit',
        'metrics.read', 'organizations.manage', 'organizations.read', 'policies.read',
        'relations.manage', 'sessions.manage', 'sessions.read',
        'users.manage', 'users.read', 'webhooks.manage', 'webhooks.read',
    ];

    /**
     * Default console roles: key => [label, permission keys | 'all', is_privileged].
     *
     * @var array<string, array{0: string, 1: 'all'|list<string>, 2: bool}>
     */
    private const ROLES = [
        'iam-admin' => ['IAM Administrator', 'all', true],
        'iam-auditor' => ['IAM Auditor', ['audit.read', 'metrics.read', 'decisions.explain'], false],
        'user-manager' => ['User Manager', ['users.read', 'users.manage', 'sessions.read', 'sessions.manage', 'grants.manage'], false],
    ];

    /**
     * The full `iam:*` permission surface as full_keys (e.g. `iam:users.read`). Exposed so a test can
     * assert it hasn't drifted from the Admin API and that the super-admin is allowed every one.
     *
     * @return list<string>
     */
    public static function permissionFullKeys(): array
    {
        return array_map(fn (string $k): string => "iam:{$k}", self::PERMISSIONS);
    }

    public function run(): void
    {
        // 1) Ensure the iam:* permission catalog rows exist (role grants expand only through them).
        $permId = [];
        foreach (self::PERMISSIONS as $key) {
            $permId[$key] = Permission::query()->firstOrCreate(
                ['full_key' => "iam:{$key}"],
                ['app_key' => 'iam', 'key' => $key],
            )->getKey();
        }

        // 2) Roles + 3) role→permission pivots.
        foreach (self::ROLES as $key => [$label, $perms, $privileged]) {
            $role = Role::query()->firstOrCreate(
                ['full_key' => "iam:{$key}"],
                ['app_key' => 'iam', 'key' => $key, 'label' => $label, 'is_privileged' => $privileged],
            );
            $keys = $perms === 'all' ? self::PERMISSIONS : $perms;
            $role->permissions()->sync(array_map(fn (string $k) => $permId[$k], $keys));
        }
    }
}
