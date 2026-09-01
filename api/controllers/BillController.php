<?php
class BillController {
    private $request;
    private $db;
    private $masterDb;

    public function __construct(Request $request, PDO $tenantDb = null, PDO $masterDb = null) {
        $this->request = $request;
        $this->db = $tenantDb;
        $this->masterDb = $masterDb;
    }

    public function query() {
        $customerId = $this->request->getQueryParam('customer_id');
        $mobile = $this->request->getQueryParam('mobile');
        $pppoeUsername = $this->request->getQueryParam('pppoe_username');
        $accNo = $this->request->getQueryParam('acc_no'); // fallback support
        
        $customer = null;

        if ($customerId) {
            $stmt = $this->db->prepare("SELECT id, user_id as acc_no, name, phone, status, bill_amount, current_bill_date, user_package FROM users WHERE id = ?");
            $stmt->execute([$customerId]);
            $customer = $stmt->fetch();
        } elseif ($mobile) {
            $stmt = $this->db->prepare("SELECT id, user_id as acc_no, name, phone, status, bill_amount, current_bill_date, user_package FROM users WHERE phone = ?");
            $stmt->execute([$mobile]);
            $customer = $stmt->fetch();
        } elseif ($pppoeUsername) {
            $stmt = $this->db->prepare("SELECT id, user_id as acc_no, name, phone, status, bill_amount, current_bill_date, user_package FROM users WHERE user_id = ?");
            $stmt->execute([$pppoeUsername]);
            $customer = $stmt->fetch();
        } elseif ($accNo) {
            $stmt = $this->db->prepare("SELECT id, user_id as acc_no, name, phone, status, bill_amount, current_bill_date, user_package FROM users WHERE user_id = ?");
            $stmt->execute([$accNo]);
            $customer = $stmt->fetch();
        } else {
            Response::fail(['error' => 'One of customer_id, mobile, or pppoe_username query parameters is required'], 400, $this->request->getRequestId());
        }

        if (!$customer) {
            Response::fail(['error' => 'Customer account not found'], 404, $this->request->getRequestId());
        }

        $totalDue = (float)$customer['bill_amount'];
        $billingMonth = !empty($customer['current_bill_date']) ? date('Y-m', strtotime($customer['current_bill_date'])) : date('Y-m');

        Response::success([
            'customer_id' => (int)$customer['id'],
            'acc_no' => $customer['acc_no'],
            'name' => $customer['name'],
            'mobile' => $customer['phone'],
            'package' => $customer['user_package'],
            'monthly_bill' => (float)$customer['bill_amount'],
            'due_amount' => (float)number_format($totalDue, 2, '.', ''),
            'billing_month' => $billingMonth,
            'connection_status' => $customer['status']
        ], 200, $this->request->getRequestId());
    }

    public function post() {
        require_once API_ROOT . '/../includes/functions.php';

        $body = $this->request->getJsonBody();
        $required = ['customer_id', 'amount', 'gateway', 'trxid', 'paid_at'];
        $errors = [];
        foreach ($required as $field) {
            if (!isset($body[$field]) || $body[$field] === '') {
                $errors[$field] = "$field is required";
            }
        }
        if (!empty($errors)) {
            Response::fail($errors, 422, $this->request->getRequestId());
        }
        
        $customerIdInput = trim($body['customer_id']);
        $amount = (float)$body['amount'];
        $gateway = $body['gateway'];
        $trxId = $body['trxid'];
        $paidAt = $body['paid_at'];

        if ($amount <= 0) {
            Response::fail(['amount' => 'Amount must be greater than zero'], 422, $this->request->getRequestId());
        }

        try {
            // Check Duplicate trxid (Duplicate transaction ID protection)
            $stmt = $this->db->prepare("SELECT id FROM payment_gateway_logs WHERE trx_id = ?");
            $stmt->execute([$trxId]);
            if ($stmt->fetch()) {
                Response::error("Duplicate transaction ID detected", "DUPLICATE_TRX", 409, $this->request->getRequestId());
            }

            // Find Customer by ID or User ID (PPPoE Username)
            $customer = null;
            if (is_numeric($customerIdInput)) {
                $stmt = $this->db->prepare("SELECT id, user_id, name, manager_id, user_package, bill_amount, current_bill_date, credit_taken, credit_days, router_id, password FROM users WHERE id = ?");
                $stmt->execute([intval($customerIdInput)]);
                $customer = $stmt->fetch();
            }

            if (!$customer) {
                $stmt = $this->db->prepare("SELECT id, user_id, name, manager_id, user_package, bill_amount, current_bill_date, credit_taken, credit_days, router_id, password FROM users WHERE user_id = ?");
                $stmt->execute([$customerIdInput]);
                $customer = $stmt->fetch();
            }

            if (!$customer) {
                Response::fail(['customer_id' => 'Customer not found'], 404, $this->request->getRequestId());
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

            // Calculate Package Cost Deduction
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

            // 1. Insert Payment Log (linked to client via staff_id)
            $apiMeta = json_encode(['method' => 'API_PAY_BILL', 'gateway' => $gateway, 'paid_at' => $paidAt]);
            $stmt = $this->db->prepare("INSERT INTO payment_gateway_logs (staff_id, amount, trx_id, status, payment_id, gateway_response) VALUES (?, ?, ?, 'COMPLETED', ?, ?)");
            $stmt->execute([$userId, $amount, $trxId, $trxId, $apiMeta]);
            $paymentLogId = $this->db->lastInsertId();

            // 2. Update User Account Expiry and Status
            $stmt = $this->db->prepare("UPDATE users SET current_bill_date = ?, credit_taken = 0, credit_days = 0, status = 'Active', bill_position = 'Active' WHERE id = ?");
            $stmt->execute([$newExpiry, $userId]);

            // A. LOG INCOME (Master Ledger / fin_cashbook)
            log_finance($this->db, 'Income', $amount, $gateway, 'Online Payment', $userId, "Bill Collection: Online payment from {$accNo} via {$gateway} (API). TRX: {$trxId}");
            
            // B. LOG INCOME (Staff/Manager Ledger)
            $managerLogId = $managerId > 0 ? $managerId : ($this->db->query("SELECT id FROM staff WHERE role='Admin' ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 1);
            log_tx($this->db, $managerLogId, 'Income', $amount, "Online payment from client {$accNo} via {$gateway} (API). TRX: {$trxId}", $gateway);

            // C. LOG EXPENSE / PROFIT (If there is a cost)
            if ($serviceCost > 0) {
                // Master Ledger Expense
                log_finance($this->db, 'Expense', -$adminCost, 'System', 'Package Cost', $userId, "Recharge Cost for client {$accNo} (Online). TRX: {$trxId}");
                
                // Profit Log
                log_profit($this->db, $managerLogId, $userId, $accNo, $amount, $serviceCost, "API $gateway");

                // If it's a Reseller, deduct from their balance
                if ($managerId > 0 && !isAdminRole($mgrRole)) {
                    $this->db->prepare("UPDATE staff SET balance = balance - ? WHERE id = ?")->execute([$serviceCost, $managerId]);
                    log_tx($this->db, $managerId, 'Expense', $serviceCost, "Recharge Cost (Online): {$accNo}. TRX: {$trxId}", 'System', null, $adminCost);
                }
            }

            // 4. Record Recharge History (for Client Profile UI)
            $rechargeDesc = "API Pay Bill: {$accNo} for {$daysToAdd} days - Amount: ৳{$amount} via {$gateway}. TRX: {$trxId}";
            $stmt = $this->db->prepare("INSERT INTO audit_log (admin_user, action_type, target_id, description) VALUES ('API Gateway', 'Recharge', ?, ?)");
            $stmt->execute([$userId, $rechargeDesc]);

            // --- COMMIT ---
            $this->db->commit();

            // Sync with MikroTik
            $routerId = (int)($customer['router_id'] ?? 0);
            if ($routerId > 0) {
                try {
                    $stmtRouter = $this->db->prepare("SELECT * FROM routers WHERE id = ?");
                    $stmtRouter->execute([$routerId]);
                    $r = $stmtRouter->fetch(PDO::FETCH_ASSOC);
                    if ($r) {
                        require_once __DIR__ . '/../../classes/MikrotikApp.php';
                        $stmtSvc = $this->db->prepare("SELECT mikrotik_profile_name FROM mikrotik_services WHERE name = ?");
                        $stmtSvc->execute([$customer['user_package']]);
                        $profile = $stmtSvc->fetchColumn() ?: '';
                        
                        $mk = new MikrotikApp($r);
                        $mk->toggle($accNo, true, $profile, $customer['password']);
                    }
                } catch (Exception $e) {
                    Logger::error("API Pay Bill Mikrotik Sync Failed for user $accNo: " . $e->getMessage());
                }
            }

            Logger::audit("API Pay Bill Processed: TRX=$trxId Amount=$amount Customer=$accNo Gateway=$gateway");

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
            Logger::error("API Pay Bill Transaction Failed: " . $e->getMessage());
            Response::error('Failed to process payment, changes rolled back.', 'PAYMENT_FAILED', 500, $this->request->getRequestId());
        }
    }

    public function status() {
        $trxId = $this->request->getQueryParam('trx_id');
        
        if (!$trxId) {
            Response::fail(['trx_id' => 'Transaction ID is required'], 400, $this->request->getRequestId());
        }

        $stmt = $this->db->prepare("
            SELECT p.status as payment_status, p.amount, p.paid_at, l.id as ledger_ref
            FROM payments p
            LEFT JOIN ledger l ON l.ref_type = 'payment' AND l.ref_id = p.id
            WHERE p.trx_id = ?
        ");
        $stmt->execute([$trxId]);
        $payment = $stmt->fetch();

        if (!$payment) {
            Response::fail(['trx_id' => 'Transaction not found'], 404, $this->request->getRequestId());
        }

        $posting_status = $payment['ledger_ref'] ? 'posted' : 'pending';

        Response::success([
            'payment_status' => $payment['payment_status'],
            'posting_status' => $posting_status,
            'amount_paid' => (float)$payment['amount'],
            'ledger_reference' => $payment['ledger_ref']
        ], 200, $this->request->getRequestId());
    }
}
