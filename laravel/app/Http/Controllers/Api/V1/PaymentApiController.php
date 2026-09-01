<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;

class PaymentApiController extends Controller
{
    /**
     * 5. Pay Bill API
     * POST /api/v1/customer/payment/paybill
     */
    public function payBill(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'gateway' => 'required|string',
            'amount' => 'required|numeric|min:0.01',
            'trxid' => 'required|string',
            'paid_at' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'fail',
                'data' => $validator->errors()
            ], 422);
        }

        $user = $request->user();
        $customerId = $user->id;

        $gateway = trim($request->input('gateway'));
        $amount = (float)$request->input('amount');
        $trxId = trim($request->input('trxid'));
        $paidAt = trim($request->input('paid_at'));

        // Query customer details
        $customer = DB::connection('tenant')->table('users')->where('id', $customerId)->first();

        if (!$customer) {
            return response()->json([
                'status' => 'error',
                'message' => 'Customer profile not found'
            ], 404);
        }

        // Check Duplicate transaction ID
        $duplicate = DB::connection('tenant')->table('payment_gateway_logs')->where('trx_id', $trxId)->exists();
        if ($duplicate) {
            return response()->json([
                'status' => 'error',
                'code' => 'DUPLICATE_TRX',
                'message' => 'Duplicate transaction ID detected'
            ], 409);
        }

        // Calculate Expiry Extension
        $billAmount = floatval($customer->bill_amount);
        $daysToAdd = 0;
        if ($billAmount > 0) {
            $perDay = $billAmount / 30;
            $daysToAdd = round($amount / $perDay);
        }

        // Deduct Advance Credit Days
        $deductDays = ($customer->credit_taken == 1) ? (int)$customer->credit_days : 0;
        $actualDaysToAdd = $daysToAdd - $deductDays;

        $currentDate = $customer->current_bill_date ? date('Y-m-d', strtotime($customer->current_bill_date)) : date('Y-m-d');
        $baseDate = ($currentDate > date('Y-m-d')) ? $currentDate : date('Y-m-d');
        $newExpiry = $baseDate;

        if ($actualDaysToAdd != 0) {
            $sign = $actualDaysToAdd > 0 ? '+' : '-';
            $absDays = abs($actualDaysToAdd);
            $newExpiry = date('Y-m-d', strtotime($baseDate . " {$sign} {$absDays} days"));
        }

        // Calculate reseller profile pricing details
        $serviceCost = 0;
        $adminCost = 0;
        $mgrRole = '';
        $managerId = (int)$customer->manager_id;

        if ($daysToAdd > 0) {
            $svc = DB::connection('tenant')->table('mikrotik_services')->where('name', $customer->user_package)->first();
            if ($svc) {
                $monthlyCost = floatval($svc->buying_price);
                if ($managerId > 0) {
                    $manager = DB::connection('tenant')->table('staff')->where('id', $managerId)->first();
                    if ($manager) {
                        $mgrRole = $manager->role;
                        // Assuming helper functions (like isAdminRole) exist or checking manually:
                        $isAdmin = in_array(strtolower($mgrRole), ['admin', 'super admin', 'superadmin']);
                        if (!$isAdmin) {
                            $customPrice = DB::connection('tenant')->table('service_pricing')
                                ->where('staff_id', $managerId)
                                ->where('service_id', $svc->id)
                                ->value('custom_price');
                            $monthlyCost = ($customPrice !== null) ? floatval($customPrice) : $monthlyCost;
                        }
                    }
                }
                $costPerDay = $monthlyCost / 30;
                $serviceCost = round($costPerDay * $daysToAdd, 2);
                
                $adminCostPerDay = floatval($svc->buying_price) / 30;
                $adminCost = round($adminCostPerDay * $daysToAdd, 2);

                if ($managerId > 0 && isset($manager) && !in_array(strtolower($manager->role), ['admin', 'superadmin']) && $serviceCost > 0) {
                    $avail = floatval($manager->balance) + floatval($manager->advance_balance_limit);
                    if ($avail < $serviceCost) {
                        return response()->json([
                            'status' => 'error',
                            'code' => 'INSUFFICIENT_FUND',
                            'message' => 'Reseller Insufficient Fund'
                        ], 422);
                    }
                }
            }
        }

        // DB Transaction
        try {
            DB::connection('tenant')->beginTransaction();

            // 1. Log payment
            $apiMeta = json_encode(['method' => 'LARAVEL_MOBILE_APP_PAY_BILL', 'gateway' => $gateway, 'paid_at' => $paidAt]);
            $paymentLogId = DB::connection('tenant')->table('payment_gateway_logs')->insertGetId([
                'staff_id' => $customerId, // customer linked
                'amount' => $amount,
                'trx_id' => $trxId,
                'status' => 'COMPLETED',
                'payment_id' => $trxId,
                'gateway_response' => $apiMeta,
                'created_at' => now()
            ]);

            // 2. Update user due & connection
            $newDue = max(0.00, floatval($customer->due) - $amount);
            DB::connection('tenant')->table('users')->where('id', $customerId)->update([
                'current_bill_date' => $newExpiry,
                'due' => $newDue,
                'credit_taken' => 0,
                'credit_days' => 0,
                'status' => 'Active',
                'bill_position' => 'Active'
            ]);

            // 3. Log main transaction ledger
            $desc = "Mobile App payment received from {$customer->user_id} via $gateway. TRX: $trxId";
            $adminId = DB::connection('tenant')->table('staff')->where('role', 'Admin')->value('id') ?? 1;
            DB::connection('tenant')->table('transactions')->insert([
                'staff_id' => $adminId,
                'type' => 'Income',
                'amount' => $amount,
                'description' => $desc,
                'method' => $gateway,
                'running_balance' => 0,
                'running_due' => 0,
                'created_at' => now()
            ]);

            // 4. Log profit/costs if applicable
            if ($serviceCost > 0) {
                $isAdmin = in_array(strtolower($mgrRole), ['admin', 'super admin', 'superadmin']);
                if ($isAdmin) {
                    $adminCostVal = $serviceCost;
                    $adminProfitVal = 0;
                } else {
                    $adminCostVal = $adminCost;
                    $adminProfitVal = max(0.00, $serviceCost - $adminCostVal);
                }

                // Profit logs
                DB::connection('tenant')->table('staff_profit_logs')->insert([
                    'staff_id' => $managerId > 0 ? $managerId : $adminId,
                    'client_id' => $customerId,
                    'client_user_id' => $customer->user_id,
                    'bill_amount' => $amount,
                    'package_cost' => $serviceCost,
                    'profit' => $amount - $serviceCost,
                    'source' => 'Mobile App ' . $gateway,
                    'admin_cost' => $adminCostVal,
                    'admin_profit' => $adminProfitVal,
                    'created_at' => now()
                ]);

                // Deduct from reseller balance if reseller is manager
                if ($managerId > 0 && !$isAdmin) {
                    DB::connection('tenant')->table('staff')
                        ->where('id', $managerId)
                        ->decrement('balance', $serviceCost);
                        
                    DB::connection('tenant')->table('transactions')->insert([
                        'staff_id' => $managerId,
                        'type' => 'Expense',
                        'amount' => $serviceCost,
                        'admin_cost' => $adminCostVal,
                        'description' => "Recharge Cost (Mobile App): {$customer->user_id}. TRX: {$trxId}",
                        'method' => 'System',
                        'created_at' => now()
                    ]);
                }
            }

            // 5. Audit logs
            DB::connection('tenant')->table('audit_log')->insert([
                'admin_user' => 'Mobile App',
                'action_type' => 'Recharge',
                'target_id' => $customerId,
                'description' => "Mobile App Pay Bill: {$customer->user_id} for {$daysToAdd} days - Amount: {$amount} via $gateway | Trx: {$trxId}",
                'created_at' => now()
            ]);

            DB::connection('tenant')->commit();

            // Sync with MikroTik router in background
            if ($customer->router_id > 0) {
                try {
                    $router = DB::connection('tenant')->table('routers')->where('id', $customer->router_id)->first();
                    if ($router) {
                        $profile = DB::connection('tenant')->table('mikrotik_services')->where('name', $customer->user_package)->value('mikrotik_profile_name') ?? '';
                        $mk = new \App\Services\MikrotikApp($router);
                        $mk->toggle($customer->user_id, true, $profile, $customer->password);
                    }
                } catch (\Exception $ex) {
                    Log::error("Laravel Mikrotik sync error during Mobile paybill: " . $ex->getMessage());
                }
            }

            return response()->json([
                'status' => 'success',
                'data' => [
                    'status' => 'success',
                    'message' => 'Payment posted successfully',
                    'payment_id' => (int)$paymentLogId,
                    'trx_id' => $trxId,
                    'customer_id' => (int)$customerId,
                    'applied_amount' => $amount
                ]
            ], 201);

        } catch (\Exception $e) {
            DB::connection('tenant')->rollBack();
            Log::error("Laravel Mobile Payment Posting failed: " . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to process payment, changes rolled back.'
            ], 500);
        }
    }

    /**
     * 6. Payment History API
     * GET /api/v1/customer/payment/history
     */
    public function history(Request $request)
    {
        $user = $request->user();
        $customerId = $user->id;

        $rows = DB::connection('tenant')->table('payment_gateway_logs')
            ->where('staff_id', $customerId)
            ->orderBy('id', 'desc')
            ->get();

        $payments = [];
        foreach ($rows as $row) {
            $gateway = 'Online';
            $paidAt = $row->created_at;

            if (!empty($row->gateway_response)) {
                $meta = json_decode($row->gateway_response, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $gateway = $meta['gateway'] ?? $gateway;
                    $paidAt = $meta['paid_at'] ?? $paidAt;
                }
            }

            $payments[] = [
                'payment_id' => (int)$row->id,
                'gateway' => $gateway,
                'amount' => (float)$row->amount,
                'trxid' => $row->trx_id,
                'status' => $row->status,
                'paid_at' => $paidAt,
                'posted_at' => $row->created_at
            ];
        }

        return response()->json([
            'status' => 'success',
            'data' => $payments
        ], 200);
    }
}
