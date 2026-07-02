<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Framework support tables (password reset + sessions).
 *
 * There is intentionally NO `users` table: the console's account store is `iam_users` (the IAM identity
 * table the Admin API reads/writes), which App\Models\User maps to (Option C, single user store). See
 * database/migrations/*_add_credentials_to_iam_users.php. Because the auth model's key is a ULID (not a
 * bigint auto-increment), adopting this store requires a fresh migrate + re-seed — it is not an in-place
 * upgrade of a previously bigint-keyed database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            // user_id is a ULID string, not a bigint: the auth model (App\Models\User) is keyed on the
            // iam_users ULID. A bigint column would reject the ULID on MySQL/Postgres; keep it a string
            // so the database session driver can store the authenticated user's id.
            $table->string('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
