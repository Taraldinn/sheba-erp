<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';

echo "Connected successfully using tenant override!\n";
echo "Active DB Name: " . DB_NAME . "\n";

try {
    $stmt = $pdo->query("SELECT COUNT(*) FROM users");
    echo "Total users in DB: " . $stmt->fetchColumn() . "\n";
} catch (Exception $e) {
    echo "Error querying users: " . $e->getMessage() . "\n";
}
?>
