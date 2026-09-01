<?php
require_once __DIR__ . '/../includes/config.php';
$q = $pdo->query('SELECT id, staff_id, gateway_name, checkout_enabled FROM tenant_payment_gateways')->fetchAll();
$c = $pdo->query('SELECT id, user_id, manager_id FROM client WHERE user_id="kader23"')->fetchAll();
echo json_encode(['gateways' => $q, 'client' => $c]);
