<?php
// scratch/inspect_payment_indices.php
require_once __DIR__ . '/../includes/config.php';

echo "=== Current Database Connection Info ===\n";
echo "Host: " . DB_HOST . "\n";
echo "DB Name: " . DB_NAME . "\n";
echo "DB User: " . DB_USER . "\n\n";

function inspect_table($pdo, $tableName) {
    echo "--- Inspecting table: $tableName ---\n";
    try {
        // Check columns
        $columns = [];
        $stmt = $pdo->query("SHOW COLUMNS FROM `$tableName`");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $columns[] = $row['Field'] . ' (' . $row['Type'] . ')';
        }
        echo "Columns: " . implode(', ', $columns) . "\n";

        // Check indexes
        $indexes = [];
        $stmt = $pdo->query("SHOW INDEX FROM `$tableName`");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $indexes[] = $row['Key_name'] . ' (Non_unique: ' . $row['Non_unique'] . ', Column: ' . $row['Column_name'] . ')';
        }
        if (empty($indexes)) {
            echo "Indexes: None\n";
        } else {
            echo "Indexes:\n  " . implode("\n  ", $indexes) . "\n";
        }
    } catch (Exception $e) {
        echo "Error: " . $e->getMessage() . "\n";
    }
    echo "\n";
}

inspect_table($pdo, 'payment_gateway_logs');
inspect_table($pdo, 'payment_sms_logs');
inspect_table($pdo, 'payment_requests');

// Let's also check other tenant databases on the server if possible.
try {
    $stmt = $pdo->query("SHOW DATABASES");
    $dbs = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo "Available databases: " . implode(', ', $dbs) . "\n";
} catch (Exception $e) {
    echo "Could not list databases: " . $e->getMessage() . "\n";
}
