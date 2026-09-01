<?php
require_once __DIR__ . '/../includes/config.php';
try {
    $res = $pdo->query("DESCRIBE tenant_payment_gateways")->fetchAll(PDO::FETCH_ASSOC);
    echo "Columns in tenant_payment_gateways table:\n";
    foreach ($res as $row) {
        echo "- " . $row['Field'] . " (" . $row['Type'] . ") Null:" . $row['Null'] . " Key:" . $row['Key'] . " Default:" . $row['Default'] . "\n";
    }
} catch (Exception $e) {
    echo "Error describing table: " . $e->getMessage() . "\n";
}
?>
