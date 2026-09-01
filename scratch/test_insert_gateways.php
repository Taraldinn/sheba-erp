<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';

try {
    $gateway_name = 'Nagad';
    $merchant_number = '01999999999';
    $device_id = 'test_device_insert';
    $api_token = 'test_token_insert';
    $status = 'active';
    
    $stmt = $pdo->prepare("INSERT INTO tenant_payment_gateways (gateway_name, merchant_number, device_id, api_token, status) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$gateway_name, $merchant_number, $device_id, $api_token, $status]);
    
    echo "Insert Succeeded! New ID: " . $pdo->lastInsertId() . "\n";
    
    // Clean up
    $pdo->prepare("DELETE FROM tenant_payment_gateways WHERE device_id = 'test_device_insert'")->execute();
    echo "Cleanup Succeeded!\n";
} catch (Exception $e) {
    echo "Error inserting gateway: " . $e->getMessage() . "\n";
}
?>
