<?php
require_once 'includes/config.php';
$tables = ['tickets'];
foreach($tables as $t) {
    echo "--- Table: $t ---\n";
    $stmt = $pdo->query("DESCRIBE $t");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach($columns as $col) {
        echo $col['Field'] . " - " . $col['Type'] . "\n";
    }
    echo "\n";
}
?>
