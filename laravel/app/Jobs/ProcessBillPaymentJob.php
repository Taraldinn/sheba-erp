<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\Services\BkashPaymentService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ProcessBillPaymentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $tenantId;
    protected $paymentData;

    /**
     * Create a new job instance.
     */
    public function __construct($paymentData)
    {
        // Resolve tenant at dispatch time from request attributes
        $tenant = request() ? request()->attributes->get('tenant') : null;
        $this->tenantId = $tenant ? $tenant->id : null;
        $this->paymentData = $paymentData;
    }

    /**
     * Execute the job.
     */
    public function handle(BkashPaymentService $paymentService): void
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

        Log::info("ProcessBillPaymentJob processing transaction: " . $this->paymentData['trx_id']);
        
        $res = $paymentService->payBill($this->paymentData);
        
        Log::info("ProcessBillPaymentJob completed with status: " . $res['status']);
    }
}
