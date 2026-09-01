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
use App\Models\PaymentGateway;
use App\Models\PaymentReconciliation;

class ReconciliationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $tenantId;

    /**
     * Create a new job instance.
     */
    public function __construct()
    {
        // Resolve tenant at dispatch time from request attributes
        $tenant = request() ? request()->attributes->get('tenant') : null;
        $this->tenantId = $tenant ? $tenant->id : null;
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

        $gateway = PaymentGateway::where('gateway_name', 'bkash_pay_bill')->first();
        if (!$gateway) {
            return;
        }

        // Fetch unreconciled transactions
        $unreconciled = PaymentReconciliation::where('is_reconciled', false)->get();

        foreach ($unreconciled as $entry) {
            $isSandbox = $gateway->environment === 'sandbox';
            $baseUrl = $isSandbox ? 'https://paybill.sandbox.bka.sh/api/v1' : 'https://paybill.bkash.com/api/v1';

            try {
                // Query transaction status from bKash outbound API
                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $gateway->api_key,
                ])->post($baseUrl . '/payment/search-transaction', [
                    'TrxId' => $entry->trxid,
                ]);

                if ($response->successful()) {
                    $body = $response->json();
                    if ($body && isset($body['ErrorCode']) && $body['ErrorCode'] === '200') {
                        $entry->update([
                            'gateway_status' => 'completed',
                            'system_status' => 'reconciled',
                            'is_reconciled' => true,
                            'reconciled_at' => now(),
                            'reconciled_by' => 'system_cron'
                        ]);
                    }
                }
            } catch (\Exception $e) {
                Log::error("bKash Reconciliation failed for TrxId {$entry->trxid}: " . $e->getMessage());
            }
        }
    }
}
