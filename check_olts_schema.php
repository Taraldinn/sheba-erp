<?php
require_once 'includes/config.php';
echo "--- DESCRIBE olts ---\n";
try {
    $stmt = $pdo->query("DESCRIBE olts");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "{$row['Field']} - {$row['Type']} - Null: {$row['Null']} - Default: {$row['Default']}\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
