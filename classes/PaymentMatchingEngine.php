<?php
class PaymentMatchingEngine {
    private $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * Handles SMS forwarded by Android merchant app.
     * Normalizes transaction IDs to uppercase for matching.
     */
    public function processIncomingSms($parsed, $rawSms, $receivedAt, $gw) {
        $trxId = strtoupper(trim($parsed['trx_id']));
        $amount = floatval($parsed['amount']);
        $gateway = trim($parsed['gateway']);
        $sender = trim($parsed['sender']);
        $referenceId = isset($parsed['reference_id']) ? trim($parsed['reference_id']) : null;
        $receivedAtFormatted = date('Y-m-d H:i:s', strtotime($receivedAt));
        
        if (is_numeric($gw)) {
            $gatewayStaffId = intval($gw);
            $gatewayId = 0;
            $merchantNumber = '';
        } else {
            $gatewayStaffId = isset($gw['staff_id']) ? intval($gw['staff_id']) : 0;
            $gatewayId = isset($gw['id']) ? intval($gw['id']) : 0;
            $merchantNumber = isset($gw['merchant_number']) ? $gw['merchant_number'] : '';
        }

        // 1. Duplicate Check: check if this trx_id has already been matched
        $stmt = $this->db->prepare("SELECT id FROM payment_sms_logs WHERE UPPER(trx_id) = ? AND status = 'matched'");
        $stmt->execute([$trxId]);
        if ($stmt->fetch()) {
            // Log as duplicate
            $stmt = $this->db->prepare("INSERT INTO payment_sms_logs (staff_id, gateway_name, sender_mobile, amount, trx_id, reference_id, raw_sms, sms_received_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'duplicate')");
            $stmt->execute([$gatewayStaffId, $gateway, $sender, $amount, $trxId, $referenceId, $rawSms, $receivedAtFormatted]);
            return false;
        }

        // Insert initially as unmatched so we have a matched_sms_log_id to tie to
        $stmt = $this->db->prepare("INSERT INTO payment_sms_logs (staff_id, gateway_name, sender_mobile, amount, trx_id, reference_id, raw_sms, sms_received_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unmatched')");
        $stmt->execute([$gatewayStaffId, $gateway, $sender, $amount, $trxId, $referenceId, $rawSms, $receivedAtFormatted]);
        $smsLogId = $this->db->lastInsertId();

        // 2. Automated SMS Checkout Intent Matching (ZiniPay Flow)
        if ($gatewayId > 0 && !empty($sender)) {
            // Convert masked sender (e.g. 0188XXXX088) to a SQL LIKE pattern (0188_088) using positional wildcards
            $normalizedSender = substr($sender, -11); // e.g. 01700000000 or 0188XXXX088
            $senderPattern = str_replace(['X', 'x', '*'], '_', $normalizedSender);
            
            try {
                $this->db->beginTransaction();
                $currentTime = date('Y-m-d H:i:s');
                // Find matching intent and lock row
                // We use LIKE to allow matching masked numbers (e.g., 01881469088 LIKE '0188_088')
                $stmt = $this->db->prepare("SELECT id, customer_id, manager_id, entity_type, invoice_id FROM payment_intents WHERE gateway_id = ? AND amount = ? AND status = 'waiting' AND expires_at >= ? AND RIGHT(payer_mobile, 11) LIKE ? ORDER BY id ASC LIMIT 1 FOR UPDATE");
                $stmt->execute([$gatewayId, $amount, $currentTime, $senderPattern]);
                $intent = $stmt->fetch();
                
                if ($intent) {
                    // We found an intent, mark it as processing
                    $stmt = $this->db->prepare("UPDATE payment_intents SET status = 'processing', provider_trx_id = ?, matched_sms_log_id = ?, detected_at = NOW() WHERE id = ?");
                    $stmt->execute([$trxId, $smsLogId, $intent['id']]);
                    
                    $this->db->commit();
                    
                    // Proceed with Settlement
                    $success = false;
                    if ($intent['entity_type'] === 'customer') {
                        $success = $this->activateClient($intent['customer_id'], $amount, $gateway, $trxId);
                    } else if ($intent['entity_type'] === 'staff') {
                        $success = $this->activateClient($intent['manager_id'], $amount, $gateway, $trxId);
                    }
                    
                    if ($success) {
                        $this->db->exec("UPDATE payment_intents SET status = 'paid', paid_at = NOW() WHERE id = " . intval($intent['id']));
                        $this->db->exec("UPDATE payment_sms_logs SET status = 'matched' WHERE id = " . intval($smsLogId));
                        return true;
                    } else {
                        $this->db->exec("UPDATE payment_intents SET status = 'failed' WHERE id = " . intval($intent['id']));
                        // Keep SMS as unmatched since settlement failed
                        return false;
                    }
                } else {
                    $this->db->rollBack();
                }
            } catch (Throwable $e) {
                if ($this->db->inTransaction()) {
                    $this->db->rollBack();
                }
                if (isset($intent) && $intent) {
                    $this->db->exec("UPDATE payment_intents SET status = 'review' WHERE id = " . intval($intent['id']));
                }
                error_log("Incoming SMS Match Error: " . $e->getMessage() . " on line " . $e->getLine());
            }
        }

        // Resolve staff managed scope if $gatewayStaffId > 0
        $managedIds = null;
        if ($gatewayStaffId > 0) {
            require_once __DIR__ . '/../includes/functions.php';
            $stmt = $this->db->prepare("SELECT role FROM staff WHERE id = ?");
            $stmt->execute([$gatewayStaffId]);
            $role = $stmt->fetchColumn() ?: 'Reseller';
            $managedIds = getManagedStaffIds($this->db, $gatewayStaffId, $role);
        }

        // 3. Auto-Match by Reference ID
        if (!empty($referenceId)) {
            // Check if it's a Quick Pay Pending Intent (QP-)
            if (strpos(strtoupper($referenceId), 'QP-') === 0) {
                $stmt = $this->db->prepare("SELECT id, staff_id, amount FROM payment_gateway_logs WHERE UPPER(trx_id) = ? AND status = 'Pending'");
                $stmt->execute([strtoupper($referenceId)]);
                $qpIntent = $stmt->fetch();
                
                if ($qpIntent && abs((float)$qpIntent['amount'] - $amount) < 0.01) {
                    $userId = $qpIntent['staff_id'];
                    $success = $this->activateClient($userId, $amount, $gateway, $trxId);
                    if ($success) {
                        $stmt = $this->db->prepare("UPDATE payment_gateway_logs SET status = 'COMPLETED', payment_id = ? WHERE id = ?");
                        $stmt->execute([$trxId, $qpIntent['id']]);
                        $stmt = $this->db->prepare("UPDATE payment_sms_logs SET status = 'matched' WHERE id = ?");
                        $stmt->execute([$smsLogId]);
                        return true;
                    }
                }
            }

            $user = null;
            if (is_array($managedIds)) {
                $placeholders = implode(',', array_fill(0, count($managedIds), '?'));
                $stmt = $this->db->prepare("SELECT id, user_id FROM users WHERE UPPER(user_id) = ? AND manager_id IN ($placeholders)");
                $stmt->execute(array_merge([strtoupper($referenceId)], $managedIds));
                $user = $stmt->fetch();
            } elseif ($managedIds === 'ALL' || $gatewayStaffId == 0) {
                $stmt = $this->db->prepare("SELECT id, user_id FROM users WHERE UPPER(user_id) = ?");
                $stmt->execute([strtoupper($referenceId)]);
                $user = $stmt->fetch();
            }
            
            if ($user) {
                $userId = $user['id'];
                $stmt = $this->db->prepare("SELECT id FROM payment_requests WHERE UPPER(trx_id) = ?");
                $stmt->execute([$trxId]);
                $existingRequest = $stmt->fetch();
                
                $success = $this->activateClient($userId, $amount, $gateway, $trxId);
                
                if ($success) {
                    $stmt = $this->db->prepare("UPDATE payment_sms_logs SET status = 'matched' WHERE id = ?");
                    $stmt->execute([$smsLogId]);

                    if ($existingRequest) {
                        $stmt = $this->db->prepare("UPDATE payment_requests SET customer_id = ?, status = 'verified', verified_at = ? WHERE id = ? AND status != 'verified'");
                        $stmt->execute([$userId, date('Y-m-d H:i:s'), $existingRequest['id']]);
                    } else {
                        $stmt = $this->db->prepare("INSERT INTO payment_requests (customer_id, invoice_id, gateway_name, amount, trx_id, status, verified_at) VALUES (?, 'AUTO_REF', ?, ?, ?, 'verified', ?)");
                        $stmt->execute([$userId, $gateway, $amount, $trxId, date('Y-m-d H:i:s')]);
                    }
                    return true;
                }
            }
        }

        // 4. Check for Pending Payment Request (Fallback)
        $request = null;
        if (is_array($managedIds)) {
            $placeholders = implode(',', array_fill(0, count($managedIds), '?'));
            $stmt = $this->db->prepare("SELECT pr.id, pr.customer_id, pr.invoice_id FROM payment_requests pr JOIN users u ON pr.customer_id = u.id WHERE UPPER(pr.trx_id) = ? AND pr.amount = ? AND pr.status = 'pending' AND u.manager_id IN ($placeholders)");
            $stmt->execute(array_merge([$trxId, $amount], $managedIds));
            $request = $stmt->fetch();
        } elseif ($managedIds === 'ALL' || $gatewayStaffId == 0) {
            $stmt = $this->db->prepare("SELECT id, customer_id, invoice_id FROM payment_requests WHERE UPPER(trx_id) = ? AND amount = ? AND status = 'pending'");
            $stmt->execute([$trxId, $amount]);
            $request = $stmt->fetch();
        }

        if ($request) {
            $success = $this->activateClient($request['customer_id'], $amount, $gateway, $trxId);
            
            if ($success) {
                $stmt = $this->db->prepare("UPDATE payment_sms_logs SET status = 'matched' WHERE id = ?");
                $stmt->execute([$smsLogId]);

                $stmt = $this->db->prepare("UPDATE payment_requests SET status = 'verified', verified_at = ? WHERE id = ? AND status != 'verified'");
                $stmt->execute([date('Y-m-d H:i:s'), $request['id']]);
                return true;
            }
        }

        // Unmatched status is already set upon insertion
        return false;
    }

    /**
     * Handles Payment Verification Request submitted by customer.
     */
    public function processClientRequest($customerId, $invoiceId, $gateway, $amount, $trxId) {
        $trxId = strtoupper(trim($trxId));
        $amount = floatval($amount);
        $gateway = trim($gateway);
        $invoiceId = trim($invoiceId ?: 'RECHARGE');

        // 1. Prevent duplicate requests
        $stmt = $this->db->prepare("SELECT id, status FROM payment_requests WHERE UPPER(trx_id) = ?");
        $stmt->execute([$trxId]);
        $existing = $stmt->fetch();
        if ($existing) {
             return ['success' => false, 'message' => 'Transaction ID already submitted. Status: ' . $existing['status']];
        }

        // 2. Search for existing unmatched SMS log
        $stmt = $this->db->prepare("SELECT id, raw_sms, sms_received_at FROM payment_sms_logs WHERE UPPER(trx_id) = ? AND amount = ? AND status = 'unmatched'");
        $stmt->execute([$trxId, $amount]);
        $sms = $stmt->fetch();

        if ($sms) {
            // Match found! Process payment immediately
            $success = $this->activateClient($customerId, $amount, $gateway, $trxId);
            if ($success) {
                // Update SMS Log to matched
                $stmt = $this->db->prepare("UPDATE payment_sms_logs SET status = 'matched' WHERE id = ? AND status = 'unmatched'");
                $stmt->execute([$sms['id']]);
                if ($stmt->rowCount() === 0) {
                    return ['success' => false, 'message' => 'SMS already matched concurrently'];
                }

                // Insert verified request
                $stmt = $this->db->prepare("INSERT INTO payment_requests (customer_id, invoice_id, gateway_name, amount, trx_id, status, verified_at) VALUES (?, ?, ?, ?, ?, 'verified', ?)");
                $stmt->execute([$customerId, $invoiceId, $gateway, $amount, $trxId, date('Y-m-d H:i:s')]);

                return ['success' => true, 'message' => 'Payment matched and verified successfully! Package activated.'];
            }
        }

        // No matching SMS found yet. Log as pending
        $stmt = $this->db->prepare("INSERT INTO payment_requests (customer_id, invoice_id, gateway_name, amount, trx_id, status) VALUES (?, ?, ?, ?, ?, 'pending')");
        $stmt->execute([$customerId, $invoiceId, $gateway, $amount, $trxId]);

        return ['success' => true, 'message' => 'Payment request submitted. Connection will auto-activate when payment SMS is received.'];
    }

    /**
     * Polling fallback: Checks if an unmatched SMS already exists for this intent.
     * Useful if the webhook fired BEFORE the intent became 'waiting' or if there was a timezone bug.
     */
    public function attemptCatchupMatch($intentId) {
        $stmt = $this->db->prepare("SELECT * FROM payment_intents WHERE id = ? AND status = 'waiting'");
        $stmt->execute([$intentId]);
        $intent = $stmt->fetch();
        if (!$intent || empty($intent['payer_mobile'])) return false;

        $normalizedSender = substr($intent['payer_mobile'], -11);

        // Find an unmatched SMS that matches the amount and sender pattern
        // REPLACE 'X'/'x'/'*' with '_' for positional exact match
        $catchupStmt = $this->db->prepare("
            SELECT id, trx_id, gateway_name 
            FROM payment_sms_logs 
            WHERE status = 'unmatched' 
            AND amount = ? 
            AND sms_received_at >= ?
            AND ? LIKE REPLACE(REPLACE(REPLACE(RIGHT(sender_mobile, 11), 'X', '_'), 'x', '_'), '*', '_')
            ORDER BY id ASC LIMIT 1
        ");
        $catchupStmt->execute([$intent['amount'], $intent['created_at'], $normalizedSender]);
        $sms = $catchupStmt->fetch();

        if ($sms) {
            $this->db->beginTransaction();
            try {
                $stmt = $this->db->prepare("UPDATE payment_intents SET status = 'processing', provider_trx_id = ?, matched_sms_log_id = ?, detected_at = NOW() WHERE id = ?");
                $stmt->execute([$sms['trx_id'], $sms['id'], $intent['id']]);
                $this->db->commit();

                $success = false;
                if ($intent['entity_type'] === 'customer') {
                    $success = $this->activateClient($intent['customer_id'], $intent['amount'], $sms['gateway_name'], $sms['trx_id']);
                } else if ($intent['entity_type'] === 'staff') {
                    $success = $this->activateClient($intent['manager_id'], $intent['amount'], $sms['gateway_name'], $sms['trx_id']);
                }

                if ($success) {
                    $this->db->exec("UPDATE payment_intents SET status = 'paid', paid_at = NOW() WHERE id = " . intval($intent['id']));
                    $this->db->exec("UPDATE payment_sms_logs SET status = 'matched' WHERE id = " . intval($sms['id']));
                    return 'paid';
                } else {
                    $this->db->exec("UPDATE payment_intents SET status = 'failed' WHERE id = " . intval($intent['id']));
                    return 'failed';
                }
            } catch (Throwable $e) {
                if ($this->db->inTransaction()) {
                    $this->db->rollBack();
                }
                $this->db->exec("UPDATE payment_intents SET status = 'review' WHERE id = " . intval($intent['id']));
                error_log("Catchup Match Error (Intent ID: " . $intent['id'] . "): " . $e->getMessage() . " on line " . $e->getLine());
                return 'review';
            }
        }
        return false;
    }

    /**
     * Triggers the core billing payment function.
     */
    private function activateClient($customerId, $amount, $gateway, $trxId) {
        require_once __DIR__ . '/../includes/functions.php';
        
        // Check for idempotency: if this trxId was already settled for this amount, do not recharge
        $stmt = $this->db->prepare("SELECT id, status FROM payment_gateway_logs WHERE UPPER(trx_id) = ? AND amount = ?");
        $stmt->execute([strtoupper(trim($trxId)), $amount]);
        $existing = $stmt->fetch();
        
        if ($existing && $existing['status'] === 'COMPLETED') {
            return true; // Already processed
        }

        try {
            $this->db->beginTransaction();
            $apiMeta = json_encode(['method' => 'SMS_VERIFIED', 'gateway' => $gateway, 'trx_id' => $trxId]);
            
            if (!$existing) {
                $stmt = $this->db->prepare("INSERT INTO payment_gateway_logs (staff_id, amount, trx_id, status, payment_id, gateway_response) VALUES (?, ?, ?, 'PENDING', ?, ?)");
                $stmt->execute([$customerId, $amount, $trxId, $trxId, $apiMeta]);
                $logId = $this->db->lastInsertId();
            } else {
                $logId = $existing['id'];
            }

            // Process Online Payment extension
            $success = processOnlinePaymentSuccess($this->db, $customerId, $amount, $gateway . '_SMS', json_decode($apiMeta, true));
            
            if ($success) {
                $this->db->exec("UPDATE payment_gateway_logs SET status = 'COMPLETED' WHERE id = " . intval($logId));
                $this->db->commit();
                return true;
            } else {
                $this->db->rollBack();
                return false;
            }
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("ActivateClient Exception: " . $e->getMessage() . " on line " . $e->getLine());
            throw $e;
        }
    }
}
