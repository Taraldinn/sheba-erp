<?php
class CustomerPaymentController {
    private $request;
    private $db;
    private $masterDb;

    public function __construct(Request $request, PDO $tenantDb = null, PDO $masterDb = null) {
        $this->request = $request;
        $this->db = $tenantDb;
        $this->masterDb = $masterDb;
    }

    /**
     * 5. Pay Bill API
     * POST /api/v1/customer/payment/paybill
     */
    public function payBill() {
        require_once API_ROOT . '/../includes/functions.php';

        $customer = $this->request->getCustomer();
        $body = $this->request->getJsonBody();

        $required = ['gateway', 'amount', 'trxid', 'paid_at'];
        $errors = [];
        foreach ($required as $field) {
            if (!isset($body[$field]) || $body[$field] === '') {
                $errors[$field] = "$field is required";
            }
        }
        if (!empty($errors)) {
            Response::fail($errors, 422, $this->request->getRequestId());
        }

        $gateway = trim($body['gateway']);
        $amount = (float)$body['amount'];
        $trxId = trim($body['trxid']);
        $paidAt = trim($body['paid_at']);

        if ($amount <= 0) {
            Response::fail(['amount' => 'Amount must be greater than zero'], 422, $this->request->getRequestId());
        }

        try {
            // Check Duplicate transaction ID
            $stmt = $this->db->prepare("SELECT id FROM payment_gateway_logs WHERE trx_id = ?");
            $stmt->execute([$trxId]);
            if ($stmt->fetch()) {
                Response::error("Duplicate transaction ID detected", "DUPLICATE_TRX", 409, $this->request->getRequestId());
            }

            $userId = $customer['id'];
            $accNo = $customer['user_id'];
            $managerId = (int)$customer['manager_id'];

            // Calculate Expiry Extension
            $billAmount = floatval($customer['bill_amount']);
            $daysToAdd = 0;
            if ($billAmount > 0) {
                $perDay = $billAmount / 30;
                $daysToAdd = round($amount / $perDay);
            }

            // Deduct Advance Credit Days
            $deductDays = ($customer['credit_taken'] == 1) ? (int)$customer['credit_days'] : 0;
            $actualDaysToAdd = $daysToAdd - $deductDays;

            $currentDate = !empty($customer['current_bill_date']) ? date('Y-m-d', strtotime($customer['current_bill_date'])) : date('Y-m-d');
            $baseDate = ($currentDate > date('Y-m-d')) ? $currentDate : date('Y-m-d');
            $newExpiry = $baseDate;

            if ($actualDaysToAdd != 0) {
                $sign = $actualDaysToAdd > 0 ? '+' : '-';
                $absDays = abs($actualDaysToAdd);
                $newExpiry = date('Y-m-d', strtotime($baseDate . " {$sign} {$absDays} days"));
            }

            // Calculate Reseller Package Cost Deduction
            $serviceCost = 0;
            $adminCost = 0;
            $mgrRole = '';

            if ($daysToAdd > 0) {
                $stmt = $this->db->prepare("SELECT id, buying_price FROM mikrotik_services WHERE name = ?");
                $stmt->execute([$customer['user_package'] ?? '']);
                $svc = $stmt->fetch();

                if ($svc) {
                    $monthlyCost = floatval($svc['buying_price']);
                    if ($managerId > 0) {
                        $stmt = $this->db->prepare("SELECT role, balance, advance_balance_limit, due_balance FROM staff WHERE id = ?");
                        $stmt->execute([$managerId]);
                        $manager = $stmt->fetch();
                        if ($manager) {
                            $mgrRole = $manager['role'];
                            if (!isAdminRole($mgrRole)) {
                                $stmt = $this->db->prepare("SELECT custom_price FROM service_pricing WHERE staff_id = ? AND service_id = ?");
                                $stmt->execute([$managerId, $svc['id']]);
                                $customPrice = $stmt->fetchColumn();
                                $monthlyCost = ($customPrice !== false && $customPrice !== null) ? floatval($customPrice) : $monthlyCost;
                            }
                        }
                    }
                    $costPerDay = $monthlyCost / 30;
                    $serviceCost = round($costPerDay * $daysToAdd, 2);
                    
                    $adminCostPerDay = floatval($svc['buying_price']) / 30;
                    $adminCost = round($adminCostPerDay * $daysToAdd, 2);

                    if ($managerId > 0 && !isAdminRole($mgrRole) && $serviceCost > 0) {
                        $avail = floatval($manager['balance']) + floatval($manager['advance_balance_limit']);
                        if ($avail < $serviceCost) {
                            Response::error('Reseller Insufficient Fund', 'INSUFFICIENT_FUND', 422, $this->request->getRequestId());
                        }
                    }
                }
            }

            // --- BEGIN DB TRANSACTION ---
            $this->db->beginTransaction();

            // 1. Insert Payment Log (staff_id represents customer ID for client payments)
            $apiMeta = json_encode(['method' => 'MOBILE_APP_PAY_BILL', 'gateway' => $gateway, 'paid_at' => $paidAt]);
            $stmt = $this->db->prepare("INSERT INTO payment_gateway_logs (staff_id, amount, trx_id, status, payment_id, gateway_response) VALUES (?, ?, ?, 'COMPLETED', ?, ?)");
            $stmt->execute([$userId, $amount, $trxId, $trxId, $apiMeta]);
            $paymentLogId = $this->db->lastInsertId();

            // 2. Update User Account Expiry, Due (deduct payment from due), and Status
            $newDue = max(0.00, floatval($customer['due']) - $amount);
            $stmt = $this->db->prepare("UPDATE users SET current_bill_date = ?, due = ?, credit_taken = 0, credit_days = 0, status = 'Active', bill_position = 'Active' WHERE id = ?");
            $stmt->execute([$newExpiry, $newDue, $userId]);

            // A. LOG INCOME (Master Ledger / fin_cashbook)
            log_finance($this->db, 'Income', $amount, $gateway, 'Online Payment', $userId, "Bill Collection: Mobile App payment from {$accNo} via {$gateway}. TRX: {$trxId}");

            // B. LOG INCOME (Staff/Manager Ledger)
            $managerLogId = $managerId > 0 ? $managerId : ($this->db->query("SELECT id FROM staff WHERE role='Admin' ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 1);
            log_tx($this->db, $managerLogId, 'Income', $amount, "Mobile App payment from client {$accNo} via {$gateway}. TRX: {$trxId}", $gateway);

            // C. LOG EXPENSE / PROFIT (If there is a cost)
            if ($serviceCost > 0) {
                // Master Ledger Expense
                log_finance($this->db, 'Expense', -$adminCost, 'System', 'Package Cost', $userId, "Recharge Cost for client {$accNo} (Mobile App). TRX: {$trxId}");
                
                // Profit Log
                log_profit($this->db, $managerLogId, $userId, $accNo, $amount, $serviceCost, "Mobile App $gateway");

                // If it's a Reseller, deduct from their balance
                if ($managerId > 0 && !isAdminRole($mgrRole)) {
                    $this->db->prepare("UPDATE staff SET balance = balance - ? WHERE id = ?")->execute([$serviceCost, $managerId]);
                    log_tx($this->db, $managerId, 'Expense', $serviceCost, "Recharge Cost (Mobile App): {$accNo}. TRX: {$trxId}", 'System', null, $adminCost);
                }
            }

            // 4. Record Recharge History (for Client Profile UI)
            $rechargeDesc = "Mobile App Pay Bill: {$accNo} for {$daysToAdd} days - Amount: ৳{$amount} via {$gateway}. TRX: {$trxId} | Trx: {$trxId}";
            $stmt = $this->db->prepare("INSERT INTO audit_log (admin_user, action_type, target_id, description) VALUES ('Mobile App', 'Recharge', ?, ?)");
            $stmt->execute([$userId, $rechargeDesc]);

            // --- COMMIT ---
            $this->db->commit();

            // Sync with MikroTik router
            $routerId = (int)($customer['router_id'] ?? 0);
            if ($routerId > 0) {
                try {
                    $stmtRouter = $this->db->prepare("SELECT * FROM routers WHERE id = ?");
                    $stmtRouter->execute([$routerId]);
                    $r = $stmtRouter->fetch(PDO::FETCH_ASSOC);
                    if ($r) {
                        require_once API_ROOT . '/../classes/MikrotikApp.php';
                        $stmtSvc = $this->db->prepare("SELECT mikrotik_profile_name FROM mikrotik_services WHERE name = ?");
                        $stmtSvc->execute([$customer['user_package']]);
                        $profile = $stmtSvc->fetchColumn() ?: '';
                        
                        $mk = new MikrotikApp($r);
                        $mk->toggle($accNo, true, $profile, $customer['password'] ?? '');
                    }
                } catch (Exception $e) {
                    Logger::error("Mobile App Pay Bill Mikrotik Sync Failed for user $accNo: " . $e->getMessage());
                }
            }

            Logger::audit("Mobile App Pay Bill Processed: TRX=$trxId Amount=$amount Customer=$accNo Gateway=$gateway");

            Response::success([
                'status' => 'success',
                'message' => 'Payment posted successfully',
                'payment_id' => (int)$paymentLogId,
                'trx_id' => $trxId,
                'customer_id' => (int)$userId,
                'applied_amount' => $amount
            ], 201, $this->request->getRequestId());

        } catch (Exception $e) {
            $this->db->rollBack();
            Logger::error("Mobile App Pay Bill Transaction Failed: " . $e->getMessage());
            Response::error('Failed to process payment, changes rolled back.', 'PAYMENT_FAILED', 500, $this->request->getRequestId());
        }
    }

    /**
     * 6. Payment History API
     * GET /api/v1/customer/payment/history
     */
    public function history() {
        $customer = $this->request->getCustomer();

        // Get payment logs linked to the customer
        $stmt = $this->db->prepare("
            SELECT id, amount, trx_id, status, gateway_response, created_at 
            FROM payment_gateway_logs 
            WHERE staff_id = ? 
            ORDER BY id DESC
        ");
        $stmt->execute([$customer['id']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $payments = [];
        foreach ($rows as $row) {
            $gateway = 'Online';
            $paidAt = $row['created_at'];

            // Parse gateway and paid_at from gateway_response JSON metadata if available
            if (!empty($row['gateway_response'])) {
                $meta = json_decode($row['gateway_response'], true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $gateway = $meta['gateway'] ?? $gateway;
                    $paidAt = $meta['paid_at'] ?? $paidAt;
                }
            }

            $payments[] = [
                'payment_id' => (int)$row['id'],
                'gateway' => $gateway,
                'amount' => (float)$row['amount'],
                'trxid' => $row['trx_id'],
                'status' => $row['status'],
                'paid_at' => $paidAt,
                'posted_at' => $row['created_at']
            ];
        }

        Response::success($payments, 200, $this->request->getRequestId());
    }
}
