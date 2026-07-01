<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database. Bootstraps the first super-admin so you can log in and run the
     * whole console. Credentials come from IAM_SUPERADMIN_* env (dev default admin@example.com / password).
     */
    public function run(): void
    {
        $this->call(SuperAdminSeeder::class);
    }
}
