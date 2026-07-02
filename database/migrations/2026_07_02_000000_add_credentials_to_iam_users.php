<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Option C — single user store.
 *
 * The server package owns `iam_users` (identity only) and leaves credential storage to the deploying
 * host. This additive migration carries the Fortify credential columns on `iam_users` so App\Models\User
 * can authenticate against the very rows the Admin API reads/writes — one source of truth, no dual store.
 *
 * `password` is nullable on purpose: identities provisioned by federation/LDAP (JitProvisioner /
 * DirectoryProvisioner) legitimately have no local password. It runs after the vendor's
 * create_iam_core_tables migration (earlier timestamp), so `iam_users` already exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('iam_users', function (Blueprint $table): void {
            $table->string('password')->nullable()->after('name');
            $table->text('two_factor_secret')->nullable()->after('password');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_recovery_codes');
            $table->rememberToken();
        });
    }

    public function down(): void
    {
        Schema::table('iam_users', function (Blueprint $table): void {
            $table->dropColumn([
                'password',
                'two_factor_secret',
                'two_factor_recovery_codes',
                'two_factor_confirmed_at',
                'remember_token',
            ]);
        });
    }
};
