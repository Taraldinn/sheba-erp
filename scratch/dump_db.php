<?php
session_start();
session_write_close();
require_once __DIR__ . '/../includes/config.php';

$res = [];

$stmt = $pdo->query("SELECT id, public_token, gateway_id, gateway_name, payer_mobile, receiver_mobile, amount, status, provider_trx_id, matched_sms_log_id, created_at, expires_at, detected_at, paid_at FROM payment_intents ORDER BY id DESC LIMIT 10");
$res['intents'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

$stmt = $pdo->query("SELECT id, staff_id, gateway_name, merchant_number, device_id, status, checkout_enabled FROM tenant_payment_gateways ORDER BY id DESC LIMIT 10");
$res['gateways'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

$stmt = $pdo->query("SELECT id, staff_id, gateway_name, sender_mobile, amount, trx_id, status, sms_received_at, created_at FROM payment_sms_logs ORDER BY id DESC LIMIT 10");
$res['sms_logs'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

file_put_contents(__DIR__ . '/db_dump.json', json_encode($res, JSON_PRETTY_PRINT));
echo "Dumped";
