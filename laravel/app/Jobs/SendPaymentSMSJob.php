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

class SendPaymentSMSJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $tenantId;
    protected $customerId;
    protected $amount;
    protected $trxId;
    protected $newExpiry;

    /**
     * Create a new job instance.
     */
    public function __construct($customerId, $amount, $trxId, $newExpiry)
    {
        // Resolve tenant at dispatch time from request attributes
        $tenant = request() ? request()->attributes->get('tenant') : null;
        $this->tenantId = $tenant ? $tenant->id : null;
        $this->customerId = $customerId;
        $this->amount = $amount;
        $this->trxId = $trxId;
        $this->newExpiry = $newExpiry;
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
            Log::error("SendPaymentSMSJob failed: Customer not found. ID: " . $this->customerId);
            return;
        }

        $tenantName = isset($tenant) ? $tenant->name : 'ISP Billing';

        // Load SMS credentials
        $api_url = $this->getSetting('sms_api_url');
        $api_key = $this->getSetting('sms_api_key');
        $sender_id = $this->getSetting('sms_sender_id');
        $is_enabled = $this->getSetting('sms_enabled');

        if (!$is_enabled || $is_enabled === '0' || !$api_url || !$customer->phone) {
            Log::info("SMS sending is disabled or not configured for tenant ID: " . $this->tenantId);
            return;
        }

        $formattedExpiry = date('d M Y', strtotime($this->newExpiry));
        $message = "প্রিয় {$customer->name},\nআপনার {$this->amount} টাকা সফলভাবে গ্রহণ করা হয়েছে।\nTransaction ID: {$this->trxId}\nনতুন মেয়াদ: {$formattedExpiry}\n\nধন্যবাদ\n{$tenantName}";

        // Clean phone number
        $phone = preg_replace('/[^0-9]/', '', $customer->phone);
        if (strlen($phone) == 11 && substr($phone, 0, 1) === '0') {
            $phone = '88' . $phone;
        }

        // Replace placeholders in URL
        $url = str_replace(
            ['{KEY}', '{SENDER}', '{MSG}', '{NUMBER}'],
            [$api_key, $sender_id, urlencode($message), $phone],
            $api_url
        );

        if (strpos($api_url, '{') === false) {
            $params = [
                'api_key' => $api_key,
                'senderid' => $sender_id,
                'number' => $phone,
                'message' => $message
            ];
            $url = $api_url . (strpos($api_url, '?') === false ? '?' : '&') . http_build_query($params);
        }

        try {
            $response = Http::timeout(10)->get($url);
            $resBody = $response->body();

            // Log SMS to DB
            DB::table('sms_logs')->insert([
                'staff_id' => $customer->manager_id ?? 1,
                'phone' => $phone,
                'message' => $message,
                'response' => substr($resBody, 0, 255),
                'status' => $response->successful() ? 'Delivered' : 'Failed',
                'created_at' => now(),
                'updated_at' => now()
            ]);

            Log::info("Payment SMS sent to $phone. Status: " . $response->status());
        } catch (\Exception $e) {
            DB::table('sms_logs')->insert([
                'staff_id' => $customer->manager_id ?? 1,
                'phone' => $phone,
                'message' => $message,
                'response' => "Error: " . $e->getMessage(),
                'status' => 'Error',
                'created_at' => now(),
                'updated_at' => now()
            ]);

            Log::error("Failed to send payment SMS: " . $e->getMessage());
        }
    }

    private function getSetting($key)
    {
        return DB::table('settings')->where('key_name', $key)->value('key_value');
    }
}
