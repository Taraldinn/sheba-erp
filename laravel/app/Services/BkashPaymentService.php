<?php

namespace App\Services;

use App\Repositories\PaymentRepositoryInterface;
use App\Models\Customer;
use App\Models\PaymentGateway;
use App\Models\PaymentTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Crypt;
use App\Jobs\SendPaymentSMSJob;
use App\Jobs\SendPushNotificationJob;

class BkashPaymentService
{
    protected $paymentRepo;

    public function __construct(PaymentRepositoryInterface $paymentRepo)
    {
        $this->paymentRepo = $paymentRepo;
    }

    /**
     * Check if tenant credentials are valid.
     */
    public function validateCredentials(string $username, string $password): ?PaymentGateway
    {
        $gateway = $this->paymentRepo->getGatewayCredentials('bkash_pay_bill');
        if (!$gateway) {
            return null;
        }

        if ($gateway->username === $username && $gateway->password === $password) {
            return $gateway;
        }

        return null;
    }

    /**
     * Check bill details for a customer.
     */
    public function checkBill(string $customerIdVal): array
    {
        $customer = $this->paymentRepo->findCustomerByUserId($customerIdVal);
        if (!$customer) {
            return ['status' => 404, 'message' => 'Customer Not Found'];
        }

        if (strcasecmp($customer->status, 'Left') === 0) {
            return ['status' => 404, 'message' => 'Customer Account Left'];
        }

        // Calculate due amount
        $dueAmount = floatval($customer->due);
        
        // If due is 0 or negative, we can return the regular bill amount or 0.
        $billAmount = $dueAmount > 0 ? $dueAmount : floatval($customer->bill_amount);

        // Bill month formatting (MMYYYY e.g. 062026)
        $billMonth = date('mY');

        // Due date: end of current month
        $dueDate = date('Ymd', strtotime('last day of this month'));

        return [
            'status' => 200,
            'consumer_name' => $customer->name,
            'bill_month' => $billMonth,
            'bill_amount' => $billAmount,
            'due_date' => $dueDate,
            'customer' => $customer
        ];
    }

    /**
     * Process bKash bill payment.
     */
    public function payBill(array $data): array
    {
        $customerNo = $data['customer_no'];
        $amount = floatval($data['amount']);
        $trxId = $data['trx_id'];
        $userMobile = $data['user_mobile'] ?? '';
        
        $customer = $this->paymentRepo->findCustomerByUserId($customerNo);
        if (!$customer) {
            return ['status' => 404, 'code' => '404', 'message' => 'Customer Not Found'];
        }

        if (strcasecmp($customer->status, 'Left') === 0) {
            return ['status' => 404, 'code' => '404', 'message' => 'Customer Account Left'];
        }

        // Check duplicate transaction
        if ($this->paymentRepo->existsTransactionByTrxId($trxId)) {
            return ['status' => 436, 'code' => '436', 'message' => 'Already Paid / Duplicate Transaction'];
        }

        // Verify payable amount (minimum amount check)
        if ($amount <= 0) {
            return ['status' => 438, 'code' => '438', 'message' => 'Minimum Amount Not Paid'];
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

        // Calculate reseller pricing and cost
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
                        return ['status' => 435, 'code' => '435', 'message' => 'Reseller Insufficient Fund'];
                    }
                }
            }
        }

        try {
            DB::connection('tenant')->beginTransaction();

            // 1. Create Payment Gateway Log
            $apiMeta = json_encode(['method' => 'BKASH_PAY_BILL_API', 'user_mobile' => $userMobile, 'paid_at' => now()->toDateTimeString()]);
            DB::connection('tenant')->table('payment_gateway_logs')->insert([
                'staff_id' => $customer->id,
                'amount' => $amount,
                'trx_id' => $trxId,
                'status' => 'COMPLETED',
                'payment_id' => $trxId,
                'gateway_response' => $apiMeta,
                'created_at' => now()
            ]);

            // 2. Create Payment Transaction
            $refNumber = 'INV-' . date('Y') . '-' . str_pad(rand(1, 99999), 5, '0', STR_PAD_LEFT);
            $transaction = $this->paymentRepo->createTransaction([
                'customer_id' => $customer->id,
                'trxid' => $trxId,
                'amount' => $amount,
                'bill_month' => date('mY'),
                'status' => 'completed',
                'ref_number' => $refNumber,
                'user_mobile' => $userMobile,
                'created_by' => 'bkash_api'
            ]);

            // 3. Update customer info
            $newDue = max(0.00, floatval($customer->due) - $amount);
            DB::connection('tenant')->table('users')->where('id', $customer->id)->update([
                'current_bill_date' => $newExpiry,
                'due' => $newDue,
                'credit_taken' => 0,
                'credit_days' => 0,
                'status' => 'Active',
                'bill_position' => 'Active'
            ]);

            // 4. Record main transactions ledger (Income)
            $desc = "bKash Pay Bill received from {$customer->user_id}. TRX: $trxId";
            $adminId = DB::connection('tenant')->table('staff')->where('role', 'Admin')->value('id') ?? 1;
            DB::connection('tenant')->table('transactions')->insert([
                'staff_id' => $adminId,
                'type' => 'Income',
                'amount' => $amount,
                'description' => $desc,
                'method' => 'bKash',
                'running_balance' => 0,
                'running_due' => 0,
                'created_at' => now()
            ]);

            // 5. Profit/Cost deductions for Reseller
            if ($serviceCost > 0) {
                $isAdmin = in_array(strtolower($mgrRole), ['admin', 'super admin', 'superadmin']);
                if ($isAdmin) {
                    $adminCostVal = $serviceCost;
                    $adminProfitVal = 0;
                } else {
                    $adminCostVal = $adminCost;
                    $adminProfitVal = max(0.00, $serviceCost - $adminCostVal);
                }

                DB::connection('tenant')->table('staff_profit_logs')->insert([
                    'staff_id' => $managerId > 0 ? $managerId : $adminId,
                    'client_id' => $customer->id,
                    'client_user_id' => $customer->user_id,
                    'bill_amount' => $amount,
                    'package_cost' => $serviceCost,
                    'profit' => $amount - $serviceCost,
                    'source' => 'bKash Pay Bill',
                    'admin_cost' => $adminCostVal,
                    'admin_profit' => $adminProfitVal,
                    'created_at' => now()
                ]);

                if ($managerId > 0 && !$isAdmin && isset($manager)) {
                    DB::connection('tenant')->table('staff')
                        ->where('id', $managerId)
                        ->decrement('balance', $serviceCost);
                        
                    DB::connection('tenant')->table('transactions')->insert([
                        'staff_id' => $managerId,
                        'type' => 'Expense',
                        'amount' => $serviceCost,
                        'admin_cost' => $adminCostVal,
                        'description' => "Recharge Cost (bKash Pay Bill): {$customer->user_id}. TRX: {$trxId}",
                        'method' => 'System',
                        'created_at' => now()
                    ]);
                }
            }

            // 6. Audit logging
            DB::connection('tenant')->table('audit_log')->insert([
                'admin_user' => 'bKash API',
                'action_type' => 'Recharge',
                'target_id' => $customer->id,
                'description' => "bKash Pay Bill API: {$customer->user_id} - Amount: {$amount} | Trx: {$trxId}",
                'created_at' => now()
            ]);

            DB::connection('tenant')->commit();

            // 7. MikroTik Sync
            if ($customer->router_id > 0) {
                try {
                    $router = DB::connection('tenant')->table('routers')->where('id', $customer->router_id)->first();
                    if ($router) {
                        $profile = DB::connection('tenant')->table('mikrotik_services')->where('name', $customer->user_package)->value('mikrotik_profile_name') ?? '';
                        $mk = new \App\Services\MikrotikApp($router);
                        $mk->toggle($customer->user_id, true, $profile, $customer->password);
                    }
                } catch (\Exception $ex) {
                    Log::error("bKash API Mikrotik sync error: " . $ex->getMessage());
                }
            }

            // 8. Dispatch Async Notifications
            SendPaymentSMSJob::dispatch($customer->id, $amount, $trxId, $newExpiry);
            SendPushNotificationJob::dispatch($customer->id, $amount, $trxId);

            return [
                'status' => 200,
                'total_amount' => $amount,
                'trx_id' => $trxId,
                'ref_number' => $refNumber
            ];

        } catch (\Exception $e) {
            DB::connection('tenant')->rollBack();
            Log::error("bKash Payment processing failed: " . $e->getMessage());
            return ['status' => 500, 'code' => '500', 'message' => 'Internal Server Error during processing'];
        }
    }

    /**
     * Search transaction status.
     */
    public function searchTransaction(string $trxId): ?PaymentTransaction
    {
        return PaymentTransaction::where('trxid', $trxId)->first();
    }
}
