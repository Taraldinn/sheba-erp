<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\PaymentGateway;

class BkashGatewaySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        PaymentGateway::updateOrCreate(
            ['gateway_name' => 'bkash_pay_bill'],
            [
                'username' => 'bkash_shebafi',
                'password' => 'shebafi@bkash2026',
                'api_key' => 'apiKey_shebaFi2026SecureHashSecretKey',
                'status' => 1,
                'environment' => 'sandbox',
                'ip_whitelist' => '127.0.0.1, 103.55.12.1'
            ]
        );
    }
}
