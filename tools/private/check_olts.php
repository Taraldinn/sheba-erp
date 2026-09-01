<?php
require_once 'includes/config.php';
$stmt = $pdo->query("SELECT * FROM olts");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "OLTs found: " . count($rows) . "\n";
print_r($rows);
?>
