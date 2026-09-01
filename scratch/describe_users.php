<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/db.php';
$stmt = $pdo->query("DESCRIBE users");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo $row['Field'] . ' (' . $row['Type'] . ")\n";
}
