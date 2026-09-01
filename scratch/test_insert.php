<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
ini_set('display_errors', 1);
error_reporting(E_ALL);

try {
    $gw_id = 1; // Assuming 1 exists
    $public_token = bin2hex(random_bytes(16));
    
    $fetchResult = safeFetch($pdo, "SELECT checkout_expiry_mins FROM tenant_payment_gateways WHERE id = ?", [$gw_id]);
    $expiry_mins = $fetchResult ? ($fetchResult['checkout_expiry_mins'] ?? 10) : 10;
    
    $expires_at = date('Y-m-d H:i:s', strtotime("+$expiry_mins minutes"));
    
    $stmt = $pdo->prepare("INSERT INTO payment_intents (public_token, gateway_id, manager_id, customer_id, entity_type, invoice_id, amount, status, expires_at) VALUES (?, ?, ?, ?, 'customer', ?, ?, 'created', ?)");
    $res = $stmt->execute([$public_token, $gw_id, 2, 10, 'QP-TEST', 10.00, $expires_at]);
    
    echo "Success: " . ($res ? 'Yes' : 'No');
} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . " on line " . $e->getLine();
}
