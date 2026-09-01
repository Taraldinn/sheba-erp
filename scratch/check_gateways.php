<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
try {
    $res = $pdo->query("SELECT * FROM tenant_payment_gateways")->fetchAll(PDO::FETCH_ASSOC);
    echo "Gateways in shebafi_ripa1:\n";
    print_r($res);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
