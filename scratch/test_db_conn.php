<?php
require_once __DIR__ . '/../includes/config.php';
echo "DB connection successful!\n";
$stmt = $pdo->query("SELECT id, username, role FROM staff LIMIT 5");
print_r($stmt->fetchAll());
?>
