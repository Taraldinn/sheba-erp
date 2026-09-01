<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PaymentGateway;
use App\Models\PaymentTransaction;
use App\Models\PaymentRequest;
use App\Models\PaymentReconciliation;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Jobs\ProcessBillPaymentJob;

class BkashAdminController extends Controller
{
    public function settings(Request $request)
    {
        $gateway = PaymentGateway::where('gateway_name', 'bkash_pay_bill')->first();
        
        if ($request->isMethod('post')) {
            $data = $request->validate([
                'username' => 'required|string',
                'password' => 'required|string',
                'api_key' => 'required|string',
                'status' => 'required|integer|in:0,1',
                'environment' => 'required|string|in:sandbox,production',
                'ip_whitelist' => 'nullable|string',
            ]);

            if ($gateway) {
                $gateway->update($data);
            } else {
                PaymentGateway::create(array_merge(['gateway_name' => 'bkash_pay_bill'], $data));
            }

            return redirect()->back()->with('success', 'Gateway settings updated successfully.');
        }

        return view('admin.bkash.settings', compact('gateway'));
    }

    public function transactions(Request $request)
    {
        $query = PaymentTransaction::query()->with('customer');

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function($q) use ($search) {
                $q->where('trxid', 'like', "%$search%")
                  ->orWhere('ref_number', 'like', "%$search%")
                  ->orWhere('user_mobile', 'like', "%$search%")
                  ->orWhereHas('customer', function($cq) use ($search) {
                      $cq->where('user_id', 'like', "%$search%")
                        ->orWhere('name', 'like', "%$search%");
                  });
            });
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('created_at', [$request->input('date_from') . ' 00:00:00', $request->input('date_to') . ' 23:59:59']);
        }

        $transactions = $query->orderBy('id', 'desc')->paginate(15);

        return view('admin.bkash.transactions', compact('transactions'));
    }

    public function failedTransactions(Request $request)
    {
        $requests = PaymentRequest::where('status', 'failed')
            ->orderBy('id', 'desc')
            ->paginate(15);

        return view('admin.bkash.failed', compact('requests'));
    }

    public function retryTransaction($id)
    {
        $req = PaymentRequest::findOrFail($id);
        
        if ($req->status !== 'failed') {
            return redirect()->back()->with('error', 'Only failed transactions can be retried.');
        }

        $payload = $req->request_payload;
        if (!$payload || !isset($payload['CustomerNo']) || !isset($payload['Amount'])) {
            return redirect()->back()->with('error', 'Invalid request payload for retry.');
        }

        // Dispatch ProcessBillPaymentJob
        $paymentData = [
            'customer_no' => $payload['CustomerNo'],
            'amount' => $payload['Amount'],
            'trx_id' => $payload['TrxId'] ?? $req->trxid,
            'user_mobile' => $payload['UserMobileNumber'] ?? '',
            'pay_time' => $payload['PayTime'] ?? now()->format('YmdHis')
        ];

        ProcessBillPaymentJob::dispatch($paymentData);

        return redirect()->back()->with('success', 'Retry job dispatched to queue.');
    }

    public function reconciliation(Request $request)
    {
        if ($request->isMethod('post') && $request->filled('trxid')) {
            $trxid = $request->input('trxid');
            $amount = $request->input('amount');
            
            PaymentReconciliation::updateOrCreate(
                ['trxid' => $trxid],
                [
                    'amount' => $amount,
                    'gateway_status' => 'completed',
                    'system_status' => 'reconciled',
                    'is_reconciled' => true,
                    'reconciled_at' => now(),
                    'reconciled_by' => auth()->user() ? auth()->user()->username : 'admin'
                ]
            );

            // Also check if payment_transactions has it; if not, create it
            $exist = PaymentTransaction::where('trxid', $trxid)->exists();
            if (!$exist && $request->filled('customer_id')) {
                PaymentTransaction::create([
                    'customer_id' => $request->input('customer_id'),
                    'trxid' => $trxid,
                    'amount' => $amount,
                    'bill_month' => date('mY'),
                    'status' => 'completed',
                    'ref_number' => 'REC-' . rand(10000, 99999),
                    'user_mobile' => $request->input('user_mobile')
                ]);
            }

            return redirect()->back()->with('success', 'Manual reconciliation completed successfully.');
        }

        $reconciliations = PaymentReconciliation::orderBy('id', 'desc')->paginate(15);
        $customers = Customer::select('id', 'user_id', 'name')->get();

        return view('admin.bkash.reconciliation', compact('reconciliations', 'customers'));
    }

    public function reports()
    {
        $todayCollection = PaymentTransaction::whereDate('created_at', today())->sum('amount');
        $weeklyCollection = PaymentTransaction::whereBetween('created_at', [now()->subDays(6)->startOfDay(), now()->endOfDay()])->sum('amount');
        $monthlyCollection = PaymentTransaction::whereMonth('created_at', now()->month)
            ->whereYear('created_at', now()->year)
            ->sum('amount');
            
        $totalTxCount = PaymentTransaction::count();
        $failedRequestCount = PaymentRequest::where('status', 'failed')->count();
        $successRate = $totalTxCount > 0 ? round(($totalTxCount / ($totalTxCount + $failedRequestCount)) * 100, 2) : 100;

        $topCustomers = PaymentTransaction::select('customer_id', DB::raw('SUM(amount) as total_amount'), DB::raw('COUNT(*) as tx_count'))
            ->groupBy('customer_id')
            ->orderByDesc('total_amount')
            ->limit(5)
            ->with('customer')
            ->get();

        // Weekly trend data
        $weeklyTrend = PaymentTransaction::select(DB::raw('DATE(created_at) as date'), DB::raw('SUM(amount) as total'))
            ->whereBetween('created_at', [now()->subDays(6)->startOfDay(), now()->endOfDay()])
            ->groupBy('date')
            ->get()
            ->pluck('total', 'date')
            ->toArray();

        $trendData = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $trendData[$date] = $weeklyTrend[$date] ?? 0;
        }

        return view('admin.bkash.reports', compact('todayCollection', 'weeklyCollection', 'monthlyCollection', 'successRate', 'failedRequestCount', 'topCustomers', 'trendData'));
    }

    public function exportCsv(Request $request)
    {
        $query = PaymentTransaction::query()->with('customer');

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('created_at', [$request->input('date_from') . ' 00:00:00', $request->input('date_to') . ' 23:59:59']);
        }

        $transactions = $query->orderBy('id', 'desc')->get();

        $headers = [
            "Content-type" => "text/csv",
            "Content-Disposition" => "attachment; filename=bkash_transactions_" . date('Ymd') . ".csv",
            "Pragma" => "no-cache",
            "Cache-Control" => "must-revalidate, post-check=0, pre-check=0",
            "Expires" => "0"
        ];

        $columns = ['ID', 'Customer ID', 'Customer Name', 'TrxId', 'Amount', 'Ref Number', 'Mobile', 'Created At'];

        $callback = function() use ($transactions, $columns) {
            $file = fopen('php://output', 'w');
            fputcsv($file, $columns);

            foreach ($transactions as $tx) {
                fputcsv($file, [
                    $tx->id,
                    $tx->customer ? $tx->customer->user_id : 'N/A',
                    $tx->customer ? $tx->customer->name : 'N/A',
                    $tx->trxid,
                    $tx->amount,
                    $tx->ref_number,
                    $tx->user_mobile,
                    $tx->created_at
                ]);
            }
            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }
}
