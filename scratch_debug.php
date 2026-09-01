<?php
// scratch_debug.php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

header('Content-Type: text/plain');

echo "=== Call Center DB Debug ===\n\n";

echo "Database Host: " . DB_HOST . "\n";
echo "Database Name: " . DB_NAME . "\n\n";

// Get Session ID and roles
echo "Session admin_id: " . ($_SESSION['admin_id'] ?? 'NOT_SET') . "\n";
echo "Session user_role: " . ($_SESSION['user_role'] ?? 'NOT_SET') . "\n";
echo "get_store_owner_id(): " . get_store_owner_id() . "\n\n";

// Check ip_phone_configs table
try {
    $stmt = $pdo->query("SELECT * FROM ip_phone_configs");
    $configs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "--- ip_phone_configs (" . count($configs) . " rows) ---\n";
    foreach ($configs as $cfg) {
        print_r($cfg);
    }
} catch (Exception $e) {
    echo "Error querying ip_phone_configs: " . $e->getMessage() . "\n";
}

echo "\n";

// Check ip_phone_numbers table
try {
    $stmt = $pdo->query("SELECT * FROM ip_phone_numbers");
    $numbers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "--- ip_phone_numbers (" . count($numbers) . " rows) ---\n";
    foreach ($numbers as $num) {
        print_r($num);
    }
} catch (Exception $e) {
    echo "Error querying ip_phone_numbers: " . $e->getMessage() . "\n";
}

echo "\nDone.\n";
?>
