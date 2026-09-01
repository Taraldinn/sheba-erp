<?php
require_once __DIR__ . '/includes/db.php';
try {
    $res = $pdo->query("DESCRIBE olts")->fetchAll(PDO::FETCH_ASSOC);
    echo "Columns in olts table:\n";
    foreach ($res as $row) {
        echo "- " . $row['Field'] . " (" . $row['Type'] . ")\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
