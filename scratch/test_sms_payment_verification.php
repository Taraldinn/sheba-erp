<?php
// scratch/test_sms_payment_verification.php

header('Content-Type: text/plain; charset=UTF-8');
echo "=== Payment Verification End-to-End Test ===\n\n";

// Load configuration and bootstrap databases/migrations
define('CURRENT_TENANT', 'minhaj'); // force resolver subdomain to match local tenant
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/SmsParserService.php';
require_once __DIR__ . '/../classes/PaymentMatchingEngine.php';

// Verify DB Connection
if (!isset($pdo)) {
    echo "ERROR: PDO Database connection not initialized.\n";
    exit;
}
echo "1. Connected to tenant database successfully.\n";

// 2. Seeding Test Data
echo "2. Seeding test configuration and records...\n";

// Ensure a test tenant exists in the master database
// Since our local db functions as both tenant and master db, let's check tenants table
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subdomain VARCHAR(50) UNIQUE,
        db_name VARCHAR(50),
        db_user VARCHAR(50),
        db_pass VARCHAR(50),
        status VARCHAR(20) DEFAULT 'active'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    
    $pdo->prepare("INSERT INTO tenants (subdomain, db_name, db_user, db_pass, status) 
        VALUES ('minhaj', 'shebafi_minhaj', 'shebafi_minhaj', 'Mother519466@', 'active') 
        ON DUPLICATE KEY UPDATE status='active'")->execute();
    echo "   - Test tenant 'minhaj' registered in master DB.\n";
} catch (Exception $e) {
    echo "   - Warning setting up tenants table: " . $e->getMessage() . "\n";
}

// Register a test gateway device inside the tenant DB
try {
    $pdo->prepare("DELETE FROM tenant_payment_gateways WHERE device_id = 'TEST_DEVICE_001'")->execute();
    $pdo->prepare("INSERT INTO tenant_payment_gateways (gateway_name, merchant_number, device_id, api_token, status) 
        VALUES ('bKash', '01711223344', 'TEST_DEVICE_001', 'secret_token_123', 'active')")->execute();
    echo "   - Webhook gateway device seeded.\n";
} catch (Exception $e) {
    echo "ERROR seeding gateway: " . $e->getMessage() . "\n";
    exit;
}

// Find or Create a Test Customer
$testUserId = 'test_pppoe_user';
$customer = safeFetch($pdo, "SELECT id, due, current_bill_date FROM users WHERE user_id = ?", [$testUserId]);
if (!$customer) {
    $pdo->prepare("INSERT INTO users (name, phone, user_id, password, user_package, bill_amount, status, due, current_bill_date) 
        VALUES ('Test Verification Client', '01700000001', ?, '123456', '5Mbps_Package', 500.00, 'Active', 0.00, ?)")
        ->execute([$testUserId, date('Y-m-d', strtotime('-5 days'))]);
    $customer = safeFetch($pdo, "SELECT id, due, current_bill_date FROM users WHERE user_id = ?", [$testUserId]);
    echo "   - Created new test customer expired 5 days ago.\n";
} else {
    // Reset test customer to expired status
    $pdo->prepare("UPDATE users SET current_bill_date = ?, due = 0.00, status = 'Active' WHERE id = ?")
        ->execute([date('Y-m-d', strtotime('-5 days')), $customer['id']]);
    $customer = safeFetch($pdo, "SELECT id, due, current_bill_date FROM users WHERE id = ?", [$customer['id']]);
    echo "   - Reset existing test customer to expired status.\n";
}

$customerId = $customer['id'];
echo "   - Target Customer ID: $customerId (Expiry: {$customer['current_bill_date']})\n";


// === TEST CASE A: SMS Webhook Arrives First ===
echo "\n=== TEST CASE A: SMS Webhook Arrives First ===\n";

$trxIdA = 'TXNSMSFIRST99';
$rawSmsA = "You have received Tk 500.00 from 01888111222. TrxID $trxIdA.";
$gatewayA = 'bKash';
$receivedAt = date('Y-m-d H:i:s');

// 1. Simulate SMS Arrival (Parsed & sent to engine)
echo "1. Simulating incoming SMS Webhook for $trxIdA...\n";
$parsedA = SmsParserService::parse($gatewayA, $rawSmsA);
if (!$parsedA) {
    echo "FAIL: Failed to parse raw SMS: $rawSmsA\n";
    exit;
}

$engine = new PaymentMatchingEngine($pdo);
$matchedA1 = $engine->processIncomingSms($parsedA, $rawSmsA, $receivedAt);
echo "   - SMS matches a request immediately? " . ($matchedA1 ? "YES" : "NO (Expected: NO)") . "\n";

// Verify logged as unmatched
$smsLogA = safeFetch($pdo, "SELECT status FROM payment_sms_logs WHERE trx_id = ?", [$trxIdA]);
echo "   - SMS Log Status: " . ($smsLogA ? $smsLogA['status'] : "NOT_FOUND") . " (Expected: unmatched)\n";

// 2. Simulate Customer submitting their Verification Request later
echo "2. Customer submits matching request for $trxIdA...\n";
$resA = $engine->processClientRequest($customerId, 'RECHARGE', $gatewayA, 500.00, $trxIdA);
echo "   - Engine Response: " . $resA['message'] . "\n";

// Verify matched status
$smsLogA_After = safeFetch($pdo, "SELECT status FROM payment_sms_logs WHERE trx_id = ?", [$trxIdA]);
$requestA = safeFetch($pdo, "SELECT status FROM payment_requests WHERE trx_id = ?", [$trxIdA]);
$customerA = safeFetch($pdo, "SELECT current_bill_date FROM users WHERE id = ?", [$customerId]);

echo "   - SMS Log Status: " . ($smsLogA_After ? $smsLogA_After['status'] : "NOT_FOUND") . " (Expected: matched)\n";
echo "   - Payment Request Status: " . ($requestA ? $requestA['status'] : "NOT_FOUND") . " (Expected: verified)\n";
echo "   - Customer New Expiry Date: " . $customerA['current_bill_date'] . " (Expected: ~30 days from today)\n";


// === TEST CASE B: Customer Request Arrives First ===
echo "\n=== TEST CASE B: Customer Request Arrives First ===\n";

$trxIdB = 'TXNREQFIRST10';
$rawSmsB = "You have received payment of Tk 500.00 from 01999222333. Ref RECHARGE. TrxID $trxIdB.";
$gatewayB = 'bKash';

// Reset customer expiration to expired status
$pdo->prepare("UPDATE users SET current_bill_date = ? WHERE id = ?")->execute([date('Y-m-d', strtotime('-5 days')), $customerId]);

// 1. Customer submits request first
echo "1. Customer submits request for $trxIdB...\n";
$resB = $engine->processClientRequest($customerId, 'RECHARGE', $gatewayB, 500.00, $trxIdB);
echo "   - Engine Response: " . $resB['message'] . "\n";

// Verify logged as pending
$requestB = safeFetch($pdo, "SELECT status FROM payment_requests WHERE trx_id = ?", [$trxIdB]);
echo "   - Payment Request Status: " . ($requestB ? $requestB['status'] : "NOT_FOUND") . " (Expected: pending)\n";

// 2. Simulate SMS webhook arriving later
echo "2. Simulating incoming SMS Webhook for $trxIdB...\n";
$parsedB = SmsParserService::parse($gatewayB, $rawSmsB);
if (!$parsedB) {
    echo "FAIL: Failed to parse raw SMS: $rawSmsB\n";
    exit;
}

$matchedB = $engine->processIncomingSms($parsedB, $rawSmsB, $receivedAt);
echo "   - SMS matches request immediately? " . ($matchedB ? "YES (Expected: YES)" : "NO") . "\n";

// Verify matched status
$smsLogB_After = safeFetch($pdo, "SELECT status FROM payment_sms_logs WHERE trx_id = ?", [$trxIdB]);
$requestB_After = safeFetch($pdo, "SELECT status FROM payment_requests WHERE trx_id = ?", [$trxIdB]);
$customerB = safeFetch($pdo, "SELECT current_bill_date FROM users WHERE id = ?", [$customerId]);

echo "   - SMS Log Status: " . ($smsLogB_After ? $smsLogB_After['status'] : "NOT_FOUND") . " (Expected: matched)\n";
echo "   - Payment Request Status: " . ($requestB_After ? $requestB_After['status'] : "NOT_FOUND") . " (Expected: verified)\n";
echo "   - Customer New Expiry Date: " . $customerB['current_bill_date'] . " (Expected: ~30 days from today)\n";


// === TEST CASE C: SMS Regex Parser Match Checks ===
echo "\n=== TEST CASE C: SMS Regex Parser Checks ===\n";

$mfs_tests = [
    'bKash (SendMoney)' => [
        'gw' => 'bKash',
        'sms' => "You have received Tk 450.00 from 01711223344 at 10/06/2026 14:15. TrxID BKASHSM1.",
        'exp_trx' => 'BKASHSM1', 'exp_amt' => 450.00, 'exp_sender' => '01711223344'
    ],
    'bKash (Payment)' => [
        'gw' => 'bKash',
        'sms' => "You have received payment of Tk 1,200.00 from 01999000111. Ref Invoice12. TrxID BKASHPY2.",
        'exp_trx' => 'BKASHPY2', 'exp_amt' => 1200.00, 'exp_sender' => '01999000111'
    ],
    'Nagad (Payment Received)' => [
        'gw' => 'Nagad',
        'sms' => "Payment Received! Amount: Tk 350.00 Customer: 01811223344 TxnID: NAGADPY1.",
        'exp_trx' => 'NAGADPY1', 'exp_amt' => 350.00, 'exp_sender' => '01811223344'
    ],
    'Nagad (Cash In)' => [
        'gw' => 'Nagad',
        'sms' => "Cash In Received! Amount: Tk 750.00 Sender: 01511223344 TxnID: NAGADCI2.",
        'exp_trx' => 'NAGADCI2', 'exp_amt' => 750.00, 'exp_sender' => '01511223344'
    ],
    'Rocket (Cash In)' => [
        'gw' => 'Rocket',
        'sms' => "Rocket Cash In: Tk 600.00 from 01611223344 received. TxID: ROCKETCI1.",
        'exp_trx' => 'ROCKETCI1', 'exp_amt' => 600.00, 'exp_sender' => '01611223344'
    ],
    'Rocket (Received)' => [
        'gw' => 'Rocket',
        'sms' => "You have received Tk 800.00 from 01777222333. TxID: ROCKETRC2.",
        'exp_trx' => 'ROCKETRC2', 'exp_amt' => 800.00, 'exp_sender' => '01777222333'
    ],
    'Upay (Payment Received)' => [
        'gw' => 'Upay',
        'sms' => "Payment Received Amount: Tk 400.00 from 01311223344. TrxID: UPAYPY1.",
        'exp_trx' => 'UPAYPY1', 'exp_amt' => 400.00, 'exp_sender' => '01311223344'
    ],
];

foreach ($mfs_tests as $name => $tc) {
    $res = SmsParserService::parse($tc['gw'], $tc['sms']);
    if ($res && $res['trx_id'] === $tc['exp_trx'] && $res['amount'] === $tc['exp_amt'] && $res['sender'] === $tc['exp_sender']) {
        echo "   - [PASS] $name parsed correctly (TrxID: {$res['trx_id']}, Amt: ৳{$res['amount']}, Sender: {$res['sender']})\n";
    } else {
        echo "   - [FAIL] $name parsing failed!\n";
        echo "     Expected: TrxID={$tc['exp_trx']}, Amt={$tc['exp_amt']}, Sender={$tc['exp_sender']}\n";
        echo "     Got: " . print_r($res, true) . "\n";
    }
}


// === CLEANUP TEST DATA ===
echo "\n=== Cleanup ===\n";
$pdo->prepare("DELETE FROM payment_sms_logs WHERE trx_id IN (?, ?)")->execute([$trxIdA, $trxIdB]);
$pdo->prepare("DELETE FROM payment_requests WHERE trx_id IN (?, ?)")->execute([$trxIdA, $trxIdB]);
$pdo->prepare("DELETE FROM tenant_payment_gateways WHERE device_id = 'TEST_DEVICE_001'")->execute();
$pdo->prepare("DELETE FROM users WHERE user_id = ?")->execute([$testUserId]);
echo "Test data cleaned up successfully.\n";
echo "\n=== All Tests Completed ===\n";
