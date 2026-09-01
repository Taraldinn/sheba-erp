<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('payment_gateways', function (Blueprint $table) {
            $table->id();
            $table->string('gateway_name')->default('bkash_pay_bill');
            $table->text('username'); // Encrypted
            $table->text('password'); // Encrypted
            $table->text('api_key');  // Encrypted
            $table->tinyInteger('status')->default(1); // 1 = Enabled, 0 = Disabled
            $table->string('environment')->default('sandbox'); // sandbox, production
            $table->text('ip_whitelist')->nullable(); // comma-separated IPs
            $table->timestamps();
        });

        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id');
            $table->string('trxid')->unique();
            $table->decimal('amount', 10, 2);
            $table->string('bill_month');
            $table->string('status')->default('completed'); // completed, failed, refunded
            $table->string('ref_number')->nullable(); // invoice number/reference
            $table->string('user_mobile')->nullable();
            $table->string('created_by')->default('bkash_api');
            $table->timestamps();
            
            $table->index('customer_id');
            $table->index('trxid');
        });

        Schema::create('payment_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('trxid')->nullable();
            $table->decimal('amount', 10, 2)->nullable();
            $table->string('bill_month')->nullable();
            $table->string('status'); // success, failed, auth_error
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();
        });

        Schema::create('payment_reconciliation', function (Blueprint $table) {
            $table->id();
            $table->string('trxid')->unique();
            $table->decimal('amount', 10, 2);
            $table->string('gateway_status');
            $table->string('system_status');
            $table->boolean('is_reconciled')->default(false);
            $table->timestamp('reconciled_at')->nullable();
            $table->string('reconciled_by')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payment_reconciliation');
        Schema::dropIfExists('payment_requests');
        Schema::dropIfExists('payment_transactions');
        Schema::dropIfExists('payment_gateways');
    }
};
