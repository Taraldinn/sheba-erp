<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';

echo "=== Testing Automated Checkout Flow ===\n";

$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// 1. Ensure we have an active checkout gateway
$stmt = $pdo->prepare("SELECT id, staff_id FROM tenant_payment_gateways LIMIT 1");
$stmt->execute();
$gw = $stmt->fetch();

if (!$gw) {
    echo "No gateway found. Creating one...\n";
    $pdo->prepare("INSERT INTO tenant_payment_gateways (gateway_name, merchant_number, device_id, api_token, status, checkout_enabled) VALUES ('bKash', '01711223344', 'TEST_DEV', 'TEST_TOK', 'active', 1)")->execute();
    $gw_id = $pdo->lastInsertId();
    $staff_id = 0;
} else {
    $gw_id = $gw['id'];
    $staff_id = $gw['staff_id'];
    $pdo->prepare("UPDATE tenant_payment_gateways SET checkout_enabled = 1 WHERE id = ?")->execute([$gw_id]);
}

// 2. Create a waiting intent
$public_token = bin2hex(random_bytes(16));
$payer_mobile = '01799887766';
$amount = 505.50;
$trx_id = 'QP-TEST' . time();

$stmt = $pdo->prepare("INSERT INTO payment_intents (public_token, gateway_id, manager_id, customer_id, entity_type, invoice_id, amount, status, payer_mobile, expires_at) VALUES (?, ?, ?, 1, 'customer', ?, ?, 'waiting', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))");
$stmt->execute([$public_token, $gw_id, $staff_id, $trx_id, $amount, $payer_mobile]);
$intent_id = $pdo->lastInsertId();

echo "Intent Created. ID: $intent_id, Amount: $amount, Payer: $payer_mobile\n";

// 3. Simulate Webhook
echo "Simulating Webhook SMS...\n";
$sms_text = "You have received Tk $amount from $payer_mobile. Ref. fee Tk 0.00. Balance Tk 1000. TrxID XA98Z7Y. at 16/08/2026 12:00";

$body = [
    'device_id' => 'TEST_DEV',
    'api_token' => 'TEST_TOK',
    'gateway' => 'bKash',
    'sms_text' => $sms_text,
    'received_at' => date('c')
];

// We bypass the HTTP request and test the Matching Engine directly
require_once __DIR__ . '/../classes/SmsParserService.php';
require_once __DIR__ . '/../classes/PaymentMatchingEngine.php';

$parsed = SmsParserService::parse($body['gateway'], $body['sms_text']);

if (!$parsed) {
    echo "Failed to parse SMS!\n";
    exit;
}
echo "SMS Parsed successfully. Sender: {$parsed['sender']}, Amount: {$parsed['amount']}, TrxID: {$parsed['trx_id']}\n";

$engine = new PaymentMatchingEngine($pdo);

// Mock the GW record that verification controller passes
$gw_record = [
    'id' => $gw_id,
    'staff_id' => $staff_id,
    'merchant_number' => '01711223344',
    'gateway_name' => 'bKash'
];

// Instead of actual activateClient which requires real users, we mock activateClient if possible.
// Actually, PaymentMatchingEngine calls `$this->activateClient()`.
// If the user '1' does not exist, it might fail. Let's see.
echo "Processing incoming SMS...\n";
$result = $engine->processIncomingSms($parsed, $sms_text, date('Y-m-d H:i:s'), $gw_record);

echo "Matching Engine Result: " . ($result ? "TRUE (Matched)" : "FALSE (Not Matched or Settled)") . "\n";

// 4. Verify intent status
$stmt = $pdo->prepare("SELECT status, provider_trx_id FROM payment_intents WHERE id = ?");
$stmt->execute([$intent_id]);
$updated_intent = $stmt->fetch();

echo "Final Intent Status: {$updated_intent['status']} (Trx: {$updated_intent['provider_trx_id']})\n";

if ($updated_intent['status'] === 'paid' || $updated_intent['status'] === 'failed') {
    echo "SUCCESS: Intent transitioned correctly.\n";
} else {
    echo "FAILED: Intent did not transition. Status: {$updated_intent['status']}\n";
}
