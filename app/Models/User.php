<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;

/**
 * The console operator account.
 *
 * Option C (single store): this model maps to the IAM identity table `iam_users` — the SAME rows the
 * Admin API reads and writes — so there is one source of truth. The server package intentionally leaves
 * credential storage to the deploying host ("una UserProvider dedicata (M5.4/deploy)", see the vendored
 * Padosoft\Iam\Domain\Identity\Models\User docblock); we satisfy that here by carrying the Fortify
 * credential columns (password, remember_token, 2FA) on `iam_users` via an additive app migration
 * (database/migrations/*_add_credentials_to_iam_users.php). Ids are ULIDs (HasUlids), matching the
 * identity store and the string `iam_grants.subject_id` the PDP keys on.
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasUlids, Notifiable, TwoFactorAuthenticatable;

    protected $table = 'iam_users';

    /**
     * `iam_users.status` defaults to 'active' at the DB level and is not part of the credential surface;
     * mirror it in-memory so freshly-instantiated models carry a valid status before insert.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'active',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
