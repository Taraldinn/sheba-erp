<?php
require_once __DIR__ . '/includes/db.php';

try {
    // Check if column exists
    $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'added_by'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE transactions ADD COLUMN added_by INT NULL AFTER running_due");
        echo "Column 'added_by' added to 'transactions' table.\n";
    } else {
        echo "Column 'added_by' already exists in 'transactions' table.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
