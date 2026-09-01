<?php
require_once __DIR__ . '/../includes/config.php';
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (!isset($_GET['token'])) {
    echo json_encode(['success' => false, 'error' => 'Token missing']);
    exit;
}

$token = trim($_GET['token']);
$stmt = $pdo->prepare("SELECT * FROM payment_intents WHERE public_token = ?");
$stmt->execute([$token]);
$intent = $stmt->fetch();

if (!$intent) {
    echo json_encode(['success' => false, 'error' => 'Intent not found']);
    exit;
}

// Ensure the latest status is picked up
$current_status = $intent['status'];

if ($current_status === 'waiting' && !empty($intent['payer_mobile'])) {
    require_once __DIR__ . '/../classes/PaymentMatchingEngine.php';
    $engine = new PaymentMatchingEngine($pdo);
    $catchupResult = $engine->attemptCatchupMatch($intent['id']);
    if ($catchupResult) {
        $current_status = $catchupResult;
    }
}

$response = [
    'success' => true,
    'status' => $current_status,
];

if (in_array($current_status, ['paid', 'review'])) {
    $response['paid_at'] = $intent['paid_at'] ?? date('Y-m-d H:i:s');
    $response['transaction_id'] = $intent['provider_trx_id'] ?? null;
}

if ($current_status === 'waiting') {
    $expires = strtotime($intent['expires_at']);
    $now = time();
    $remaining = max(0, $expires - $now);
    $response['remaining_seconds'] = $remaining;
}

echo json_encode($response);
