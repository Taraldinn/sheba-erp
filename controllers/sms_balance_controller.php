<?php
// Sheba SMS / Automas provider balance endpoint (read-only AJAX).
if (!isLoggedIn()) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Unauthorized.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'GET required.']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$staff_id = (int)($_SESSION['admin_id'] ?? 0);
$ctx = get_sheba_sms_balance_context($pdo, $staff_id);
if (empty($ctx['visible'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Sheba SMS balance is not available for this account.']);
    exit;
}

$force = isset($_GET['force']) && (string)$_GET['force'] === '1';
$result = fetch_sheba_sms_balance($pdo, $staff_id, $force);
if (!empty($result['success'])) {
    $balance = (float)($result['balance'] ?? 0);
    $result['balance_formatted'] = number_format($balance, 2);
    $result['provider'] = 'Sheba SMS';
    $result['checked_at_iso'] = !empty($result['checked_at']) ? date('c', (int)$result['checked_at']) : null;
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
