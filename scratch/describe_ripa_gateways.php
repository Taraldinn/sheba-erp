<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
try {
    $res = $pdo->query("DESCRIBE tenant_payment_gateways")->fetchAll(PDO::FETCH_ASSOC);
    echo "Columns in shebafi_ripa1.tenant_payment_gateways:\n";
    foreach ($res as $row) {
        echo "- " . $row['Field'] . " (" . $row['Type'] . ") Null:" . $row['Null'] . " Key:" . $row['Key'] . " Default:" . $row['Default'] . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
