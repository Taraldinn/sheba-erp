<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class SendPushNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $tenantId;
    protected $customerId;
    protected $amount;
    protected $trxId;

    /**
     * Create a new job instance.
     */
    public function __construct($customerId, $amount, $trxId)
    {
        // Resolve tenant at dispatch time from request attributes
        $tenant = request() ? request()->attributes->get('tenant') : null;
        $this->tenantId = $tenant ? $tenant->id : null;
        $this->customerId = $customerId;
        $this->amount = $amount;
        $this->trxId = $trxId;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        if ($this->tenantId) {
            $tenant = DB::connection('mysql')->table('tenants')->where('id', $this->tenantId)->first();
            if ($tenant) {
                config(['database.connections.tenant.host' => env('DB_HOST', '127.0.0.1')]);
                config(['database.connections.tenant.database' => $tenant->db_name]);
                config(['database.connections.tenant.username' => $tenant->db_user]);
                config(['database.connections.tenant.password' => $tenant->db_pass]);

                DB::purge('tenant');
                DB::reconnect('tenant');
                DB::setDefaultConnection('tenant');
            }
        }

        $customer = DB::table('users')->where('id', $this->customerId)->first();
        if (!$customer) {
            return;
        }

        // Try to find custom device registration for FCM
        $fcmToken = DB::table('settings')->where('key_name', 'fcm_enabled')->value('key_value') === '1'
            ? DB::table('customer_devices')->where('customer_id', $this->customerId)->value('fcm_token')
            : null;

        if (!$fcmToken) {
            Log::info("FCM push notification skipped: device not registered or FCM disabled for customer ID: " . $this->customerId);
            return;
        }

        $fcmServerKey = DB::table('settings')->where('key_name', 'fcm_server_key')->value('key_value');
        if (!$fcmServerKey) {
            Log::info("FCM Server Key not configured.");
            return;
        }

        $title = "Payment Successful";
        $body = "Dear {$customer->name}, your payment of {$this->amount} TK was successfully received. TrxID: {$this->trxId}";

        try {
            $response = Http::withHeaders([
                'Authorization' => 'key=' . $fcmServerKey,
                'Content-Type' => 'application/json'
            ])->post('https://fcm.googleapis.com/fcm/send', [
                'to' => $fcmToken,
                'notification' => [
                    'title' => $title,
                    'body' => $body,
                    'sound' => 'default'
                ],
                'data' => [
                    'type' => 'payment_success',
                    'trx_id' => $this->trxId,
                    'amount' => $this->amount
                ]
            ]);

            Log::info("Push Notification sent. Status: " . $response->status());
        } catch (\Exception $e) {
            Log::error("Failed to send push notification: " . $e->getMessage());
        }
    }
}
