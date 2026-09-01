<?php
// scratch/test_matching_mismatch_fixes.php

header('Content-Type: text/plain; charset=UTF-8');
echo "=== Payment Matching Engine Mismatch Fixes Verification ===\n\n";

define('CURRENT_TENANT', 'billing'); // Set tenant ID to 'billing' to match simulated state
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/SmsParserService.php';
require_once __DIR__ . '/../classes/PaymentMatchingEngine.php';

if (!isset($pdo)) {
    echo "ERROR: Database connection PDO not initialized.\n";
    exit;
}
echo "1. Connected to database successfully.\n";

// Ensure test user 1094 exists
$testUserId = 1094;
$userExists = safeFetch($pdo, "SELECT id, current_bill_date FROM users WHERE id = ?", [$testUserId]);
if (!$userExists) {
    // Insert test user 1094
    $pdo->prepare("INSERT INTO users (id, name, phone, user_id, password, user_package, bill_amount, status, due, current_bill_date) 
        VALUES (?, 'Test User 1094', '01852033297', 'user_1094', 'password1094', '5Mbps_Package', 500.00, 'Active', 0.00, ?)")
        ->execute([$testUserId, date('Y-m-d', strtotime('-2 days'))]);
    $userExists = safeFetch($pdo, "SELECT id, current_bill_date FROM users WHERE id = ?", [$testUserId]);
    echo "2. Seeding test user 1094.\n";
} else {
    // Reset test user to expired status
    $pdo->prepare("UPDATE users SET current_bill_date = ?, due = 0.00, status = 'Active' WHERE id = ?")
        ->execute([date('Y-m-d', strtotime('-2 days')), $testUserId]);
    $userExists = safeFetch($pdo, "SELECT id, current_bill_date FROM users WHERE id = ?", [$testUserId]);
    echo "2. Reset test user 1094 status to expired (Expiry: {$userExists['current_bill_date']}).\n";
}

// Clean up any old test records for transaction
$testTrxId = 'DF925M9MPY';
$pdo->prepare("DELETE FROM payment_sms_logs WHERE trx_id = ?")->execute([$testTrxId]);
$pdo->prepare("DELETE FROM payment_requests WHERE trx_id = ?")->execute([$testTrxId]);
$pdo->prepare("DELETE FROM payment_gateway_logs WHERE trx_id = ?")->execute([$testTrxId]);
echo "3. Cleaned up existing test logs for TrxID: $testTrxId.\n";

// Seeding the exact buggy state described in the matching issue
// SMS log exists with tenant_id = 'billing', gateway_name = 'bkash', and status NULL
$pdo->prepare("INSERT INTO payment_sms_logs (tenant_id, gateway_name, sender_mobile, amount, trx_id, raw_sms, sms_received_at, status) 
    VALUES ('billing', 'bkash', '01852033297', 500.00, ?, 'You have received payment Tk 500.00 from 01852033297. Fee Tk 0.00. Balance Tk 10,015.75. TrxID DF925M9MPY at 09/06/2026 21:24', '2026-06-09 21:24:00', NULL)")
    ->execute([$testTrxId]);

// Request exists with tenant_id = NULL (buggy state) and status = 'pending'
$pdo->prepare("INSERT INTO payment_requests (tenant_id, customer_id, invoice_id, gateway_name, amount, trx_id, status, verified_at) 
    VALUES (NULL, ?, 'RECHARGE', 'bKash', 500.00, ?, 'pending', NULL)")
    ->execute([$testUserId, $testTrxId]);

echo "4. Seeded initial mismatch state: SMS Log (tenant_id = billing, status = NULL) & Request (tenant_id = NULL, status = pending).\n";

// Verify migration update logic (NULL tenant_ids should have been updated by including config.php)
$checkRequestTenant = safeFetch($pdo, "SELECT tenant_id FROM payment_requests WHERE trx_id = ?", [$testTrxId]);
echo "5. Verifying migration auto-update for NULL tenant_id:\n";
echo "   - Updated tenant_id: " . ($checkRequestTenant['tenant_id'] ?? 'STILL_NULL') . " (Expected: billing)\n";

// Execute matching by submitting matching request OR simulating incoming SMS webhook
echo "\n6. Simulating incoming SMS Webhook for DF925M9MPY to trigger match...\n";
$smsText = "You have received payment Tk 500.00 from 01852033297. Fee Tk 0.00. Balance Tk 10,015.75. TrxID DF925M9MPY at 09/06/2026 21:24";
$parsed = SmsParserService::parse('bkash', $smsText);

if (!$parsed) {
    echo "FAIL: Failed to parse raw SMS: $smsText\n";
    exit;
}
echo "   - Parsed details: Gateway={$parsed['gateway']}, Amt={$parsed['amount']}, TrxID={$parsed['trx_id']}, Sender={$parsed['sender']}\n";

$engine = new PaymentMatchingEngine($pdo, 'billing');
$matched = $engine->processIncomingSms($parsed, $smsText, '2026-06-09 21:24:00');

echo "   - SMS matches request immediately? " . ($matched ? "YES" : "NO") . "\n";

// Verify matched statuses in database
$smsLog = safeFetch($pdo, "SELECT status FROM payment_sms_logs WHERE trx_id = ?", [$testTrxId]);
$request = safeFetch($pdo, "SELECT status, verified_at FROM payment_requests WHERE trx_id = ?", [$testTrxId]);
$user = safeFetch($pdo, "SELECT current_bill_date FROM users WHERE id = ?", [$testUserId]);

echo "\n7. Matching Engine Outcome Verification:\n";
echo "   - SMS Log Status: " . ($smsLog ? $smsLog['status'] : 'NOT_FOUND') . " (Expected: matched)\n";
echo "   - Payment Request Status: " . ($request ? $request['status'] : 'NOT_FOUND') . " (Expected: approved)\n";
echo "   - Verified At timestamp filled? " . ($request['verified_at'] ? 'YES' : 'NO') . " (Value: {$request['verified_at']})\n";
echo "   - Client Package Activated (New Expiry): " . $user['current_bill_date'] . " (Expected: ~30 days from today)\n";

// Verify duplicate recharge protection
echo "\n8. Simulating duplicate customer submission for transaction DF925M9MPY...\n";
$dupRes = $engine->processClientRequest($testUserId, 'RECHARGE', 'bKash', 500.00, $testTrxId);
echo "   - Duplicate Request Response success: " . ($dupRes['success'] ? 'YES' : 'NO (Expected: NO)') . "\n";
echo "   - Duplicate Request Message: " . $dupRes['message'] . "\n";

// Check financial gateway logs
echo "\n9. Checking financial gateway logs (payment_gateway_logs):\n";
$gatewayLogs = safeFetchAll($pdo, "SELECT status, gateway_response FROM payment_gateway_logs WHERE trx_id = ? ORDER BY id ASC", [$testTrxId]);
foreach ($gatewayLogs as $idx => $gl) {
    echo "   - Log " . ($idx + 1) . ": Status={$gl['status']}, Message=" . $gl['gateway_response'] . "\n";
}

// Cleanup
$pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$testUserId]);
$pdo->prepare("DELETE FROM payment_sms_logs WHERE trx_id = ?")->execute([$testTrxId]);
$pdo->prepare("DELETE FROM payment_requests WHERE trx_id = ?")->execute([$testTrxId]);
$pdo->prepare("DELETE FROM payment_gateway_logs WHERE trx_id = ?")->execute([$testTrxId]);
echo "\nCleanup completed successfully.\n";
echo "=== All Tests Completed ===\n";
