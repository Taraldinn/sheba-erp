<?php
require_once __DIR__ . '/../includes/config.php';
try {
    $stmt = $pdo->query("DESCRIBE olts");
    $fields = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "OLT Table Columns:\n";
    foreach ($fields as $field) {
        echo "{$field['Field']} - {$field['Type']}\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
