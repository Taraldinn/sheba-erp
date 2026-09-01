<?php
require_once 'includes/config.php';
$stmt = $pdo->query("SHOW TABLES");
$tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
echo "Existing Tables:\n";
print_r($tables);
?>
