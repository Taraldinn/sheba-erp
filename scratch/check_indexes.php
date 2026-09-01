<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
try {
    $res = $pdo->query("SHOW INDEX FROM tenant_payment_gateways")->fetchAll(PDO::FETCH_ASSOC);
    echo "Indexes in shebafi_ripa1.tenant_payment_gateways:\n";
    foreach ($res as $row) {
        echo "- Table: " . $row['Table'] . " | Non_unique: " . $row['Non_unique'] . " | Key_name: " . $row['Key_name'] . " | Seq_in_index: " . $row['Seq_in_index'] . " | Column_name: " . $row['Column_name'] . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
