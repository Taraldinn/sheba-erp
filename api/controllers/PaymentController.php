<?php
class PaymentController {
    private $request;
    private $db;

    private $masterDb;

    public function __construct(Request $request, PDO $db, PDO $masterDb = null) {
        $this->request = $request;
        if ($masterDb === null) {
            $this->masterDb = $db;
            $this->db = null;
        } else {
            $this->db = $db;
            $this->masterDb = $masterDb;
        }
    }

    public function pay() {
        require_once API_ROOT . '/../includes/functions.php';
        $body = $this->request->getJsonBody();
        // Updated requirement JSON exactly
        // { "acc_no": "AG40023", "amount": 650, "trx_id": "TXN123456", "paid_at": "...", "payer_msisdn": "..." }
        $required = ['acc_no', 'amount', 'trx_id'];
        $errors = [];
        foreach ($required as $field) {
            if (!isset($body[$field]) || $body[$field] === '') {
                $errors[$field] = "$field is required";
            }
        }
        if (!empty($errors)) {
            Response::fail($errors, 422, $this->request->getRequestId());
        }
        
        $trxId = $body['trx_id'];
        $amount = (float)$body['amount'];
        $accNo = $body['acc_no'];

        if ($amount <= 0) {
            Response::fail(['amount' => 'Amount must be greater than zero'], 422, $this->request->getRequestId());
        }

        try {
            // Check Idempotency First (must not be inside DB transaction to fail fast)
            $stmt = $this->db->prepare("SELECT id, status FROM payment_gateway_logs WHERE trx_id = ?");
            $stmt->execute([$trxId]);
            $existing = $stmt->fetch();

            if ($existing) {
                // If the payment exists, don't allow processing again. Conflict is 409.
                Response::error("Duplicate transaction ID detected", "DUPLICATE_TRX", 409, $this->request->getRequestId());
            }

            // Get Customer
            $stmt = $this->db->prepare("SELECT id, manager_id, user_package, bill_amount, current_bill_date, credit_taken, credit_days, router_id, password FROM users WHERE user_id = ?");
            $stmt->execute([$accNo]);
            $customer = $stmt->fetch();
            if (!$customer) {
                Response::fail(['acc_no' => 'Account not found'], 404, $this->request->getRequestId());
            }
            $userId = $customer['id'];
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
                // Fetch service base cost
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
                    
                    // Only check sufficient funds for non-admin resellers
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
            $apiMeta = json_encode(['method' => 'API', 'payer_msisdn' => $body['payer_msisdn'] ?? '']);
            $stmt = $this->db->prepare("INSERT INTO payment_gateway_logs (staff_id, amount, trx_id, status, payment_id, gateway_response) VALUES (?, ?, ?, 'COMPLETED', ?, ?)");
            $stmt->execute([$userId, $amount, $trxId, $trxId, $apiMeta]);
            $logId = $this->db->lastInsertId();

            // 2. Update User Account Expiry and Clear Due Status
            // FIX: DO NOT set bill_amount = 0.
            $stmt = $this->db->prepare("UPDATE users SET current_bill_date = ?, credit_taken = 0, credit_days = 0, status = 'Active', bill_position = 'Active' WHERE id = ?");
            $stmt->execute([$newExpiry, $userId]);
            
            // TEMPORARY DEBUG: Check if DB saved
            $checkStmt = $this->db->prepare("SELECT status, bill_amount, current_bill_date FROM users WHERE id = ?");
            $checkStmt->execute([$userId]);
            $updatedUser = $checkStmt->fetch(PDO::FETCH_ASSOC);

            // A. LOG INCOME (Master Ledger / fin_cashbook)
            log_finance($this->db, 'Income', $amount, 'API', 'Online Payment', $userId, "API payment received from {$accNo} via API Gateway TRX: {$trxId}");
            
            // B. LOG INCOME (Staff/Manager Ledger)
            $managerLogId = $managerId > 0 ? $managerId : ($this->db->query("SELECT id FROM staff WHERE role='Admin' ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 1);
            log_tx($this->db, $managerLogId, 'Income', $amount, "API payment received from {$accNo} via API Gateway TRX: {$trxId}", 'API');

            // C. LOG EXPENSE / PROFIT (If there is a cost)
            if ($serviceCost > 0) {
                // Master Ledger Expense
                log_finance($this->db, 'Expense', -$adminCost, 'System', 'Package Cost', $userId, "Recharge Cost for client {$accNo} (Online). TRX: {$trxId}");
                
                // Profit Log
                log_profit($this->db, $managerLogId, $userId, $accNo, $amount, $serviceCost, "API Recharge");

                // If it's a Reseller, deduct from their balance
                if ($managerId > 0 && !isAdminRole($mgrRole)) {
                    $this->db->prepare("UPDATE staff SET balance = balance - ? WHERE id = ?")->execute([$serviceCost, $managerId]);
                    log_tx($this->db, $managerId, 'Expense', $serviceCost, "Recharge Cost (Online): {$accNo}. TRX: {$trxId}", 'System', null, $adminCost);
                }
            }

            // 4. Record Recharge History (for Client Profile UI)
            $rechargeDesc = "API Recharged client: {$accNo} for {$daysToAdd} days - Amount: ৳{$amount} via API. TRX: {$trxId}";
            $stmt = $this->db->prepare("INSERT INTO audit_log (admin_user, action_type, target_id, description) VALUES ('API Gateway', 'Recharge', ?, ?)");
            $stmt->execute([$userId, $rechargeDesc]);

            // --- COMMIT ---
            $this->db->commit();

            // Sync with MikroTik if router is configured (non-blocking / error-caught)
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
                    Logger::error("API Payment Mikrotik Sync Failed for user $accNo: " . $e->getMessage());
                }
            }
            
            Logger::audit("API Payment Processed: TRX=$trxId Amount=$amount Customer=$accNo");

            Response::success([
                'message' => 'Payment applied successfully',
                'trx_id' => $trxId,
                'applied_amount' => $amount,
                'reference_id' => $logId,
                'debug_updated_user' => $updatedUser
            ], 201, $this->request->getRequestId());

        } catch (Exception $e) {
            $this->db->rollBack();
            Logger::error("API Payment Transaction Failed: " . $e->getMessage());
            Response::error('Failed to process payment, changes rolled back.', 'PAYMENT_FAILED', 500, $this->request->getRequestId());
        }
    }

    public function bkashWebhook() {
        $rawBody = $this->request->getRawBody();
        $payload = json_decode($rawBody, true);

        // 1. Basic Payload Validation
        if (!$payload || !isset($payload['Type']) || !isset($payload['Signature'])) {
            Logger::error("Invalid webhook payload structure: " . $rawBody);
            Response::error('Invalid webhook payload', 'INVALID_PAYLOAD', 400, $this->request->getRequestId());
        }

        // 2. Cryptographic Signature Verification
        if (!$this->verifySnsSignature($payload)) {
            Logger::error("Signature verification failed: " . $rawBody);
            Response::error('Signature verification failed', 'INVALID_SIGNATURE', 401, $this->request->getRequestId());
        }

        // 3. Handle Subscription Confirmation
        if ($payload['Type'] === 'SubscriptionConfirmation') {
            $subscribeUrl = $payload['SubscribeURL'] ?? '';
            if (filter_var($subscribeUrl, FILTER_VALIDATE_URL)) {
                // Confirm the subscription by fetching the URL
                $ch = curl_init($subscribeUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 15);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                $res = curl_exec($ch);
                curl_close($ch);

                Logger::info("Subscription Confirmed: " . $subscribeUrl . " | Response: " . substr($res, 0, 200));
                
                Response::success(['message' => 'Subscription confirmed successfully'], 200, $this->request->getRequestId());
            }
            Response::error('Invalid SubscribeURL', 'INVALID_SUBSCRIBE_URL', 400, $this->request->getRequestId());
        }

        // 4. Handle Notification Event (Real-time Payment)
        if ($payload['Type'] === 'Notification') {
            $messageData = json_decode($payload['Message'] ?? '', true);
            if (!$messageData) {
                Response::error('Invalid Message JSON inside notification', 'INVALID_MESSAGE_JSON', 400, $this->request->getRequestId());
            }

            $trxID = $messageData['trxID'] ?? '';
            $merchantInvoiceNumber = $messageData['merchantInvoiceNumber'] ?? '';
            $transactionStatus = $messageData['transactionStatus'] ?? '';
            $amount = floatval($messageData['amount'] ?? 0);

            // We only process Completed payments
            if (strcasecmp($transactionStatus, 'Completed') !== 0) {
                Response::success(['message' => 'Notification ignored: transaction status is ' . $transactionStatus], 200, $this->request->getRequestId());
            }

            // 5. Resolve Tenant Database Dynamically
            require_once API_ROOT . '/core/TenantResolver.php';
            $tenant = TenantResolver::resolve($this->request, $this->masterDb);
            if (!$tenant) {
                Logger::error("Tenant resolution failed for host: " . ($_SERVER['HTTP_HOST'] ?? ''));
                Response::error('Tenant resolution failed', 'TENANT_UNKNOWN', 404, $this->request->getRequestId());
            }

            $tenantDb = Database::getConnection(
                $_ENV['MASTER_DB_HOST'],
                $tenant['db_name'],
                $tenant['db_user'],
                $tenant['db_pass']
            );

            // 6. Check for duplicate/processed payments
            $stmt = $tenantDb->prepare("SELECT id, status, staff_id FROM payment_gateway_logs WHERE trx_id = ? OR payment_id = ?");
            $stmt->execute([$merchantInvoiceNumber, $merchantInvoiceNumber]);
            $existingPay = $stmt->fetch();

            if (!$existingPay) {
                Logger::error("Pending transaction not found for invoice: " . $merchantInvoiceNumber);
                Response::error('Transaction record not found', 'TRANSACTION_NOT_FOUND', 404, $this->request->getRequestId());
            }

            if (strcasecmp($existingPay['status'] ?? '', 'COMPLETED') === 0) {
                Response::success(['message' => 'Transaction already processed'], 200, $this->request->getRequestId());
            }

            // Begin Tenant DB Transaction
            try {
                $tenantDb->beginTransaction();

                // 7. Update transaction status in payment_gateway_logs
                $stmtUpdate = $tenantDb->prepare("UPDATE payment_gateway_logs SET status = 'COMPLETED', payment_id = ?, gateway_response = ? WHERE id = ? AND status != 'COMPLETED'");
                $stmtUpdate->execute([$trxID, json_encode($messageData), $existingPay['id']]);
                if ($stmtUpdate->rowCount() === 0) {
                    $tenantDb->rollBack();
                    Response::success(['message' => 'Transaction already processed concurrently'], 200, $this->request->getRequestId());
                }

                // 8. Execute core billing/recharge success business logic
                require_once API_ROOT . '/../includes/functions.php';
                $userId = intval($existingPay['staff_id']);

                $success = processOnlinePaymentSuccess($tenantDb, $userId, $amount, 'bKash_IPN', $messageData);
                
                if (!$success) {
                    throw new Exception("processOnlinePaymentSuccess returned false for User ID " . $userId);
                }

                $tenantDb->commit();

                Logger::info("Webhook Successful | TrxID: $trxID | Invoice: $merchantInvoiceNumber | Amount: $amount");
                
                Response::success([
                    'message' => 'Payment applied successfully via webhook',
                    'trx_id' => $trxID,
                    'merchant_invoice' => $merchantInvoiceNumber
                ], 200, $this->request->getRequestId());

            } catch (Exception $e) {
                $tenantDb->rollBack();
                Logger::error("Transaction execution failed: " . $e->getMessage());
                Response::error('Transaction execution failed: ' . $e->getMessage(), 'INTERNAL_ERROR', 500, $this->request->getRequestId());
            }
        }

        Response::error('Unknown payload type', 'UNKNOWN_TYPE', 400, $this->request->getRequestId());
    }

    /**
     * Verifies the AWS SNS signature of the incoming webhook request payload.
     * Includes host validation to prevent SSRF and cert caching to avoid network issues.
     */
    protected function verifySnsSignature($data) {
        if (empty($data['SigningCertURL']) || empty($data['Signature'])) {
            return false;
        }

        $certUrl = $data['SigningCertURL'];
        
        // Strict AWS SNS subdomain validation to prevent SSRF or rogue certificates
        if (!preg_match('/^https:\/\/sns\.[a-z0-9\-]+\.amazonaws\.com\/SimpleNotificationService-[a-f0-9]+\.pem$/i', $certUrl)) {
            return false;
        }

        // Fetch or load from Cache
        $cacheDir = API_ROOT . '/var/cache';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0777, true);
        }
        $certName = basename($certUrl);
        $localCertPath = $cacheDir . '/' . $certName;

        if (file_exists($localCertPath)) {
            $cert = file_get_contents($localCertPath);
        } else {
            $cert = @file_get_contents($certUrl);
            if ($cert) {
                @file_put_contents($localCertPath, $cert);
            }
        }

        if (!$cert) {
            return false;
        }

        // Determine fields based on AWS SNS specification
        $type = $data['Type'] ?? '';
        if ($type === 'Notification') {
            $fields = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
        } elseif ($type === 'SubscriptionConfirmation' || $type === 'UnsubscribeConfirmation') {
            $fields = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
        } else {
            return false;
        }

        sort($fields);

        $stringToSign = "";
        foreach ($fields as $field) {
            if (isset($data[$field])) {
                $stringToSign .= $field . "\n" . $data[$field] . "\n";
            }
        }

        $signature = base64_decode($data['Signature']);
        $publicKey = openssl_get_publickey($cert);

        if (!$publicKey) {
            return false;
        }

        // Determine hash algorithm (AWS SNS defaults to SHA1 for version 1, SHA256 for version 2)
        $algo = OPENSSL_ALGO_SHA1;
        if (isset($data['SignatureVersion']) && $data['SignatureVersion'] === '2') {
            $algo = OPENSSL_ALGO_SHA256;
        }

        $result = openssl_verify($stringToSign, $signature, $publicKey, $algo);
        openssl_free_key($publicKey);

        return $result === 1;
    }
}
