<?php
require_once __DIR__ . '/../includes/config.php';

// Try to load DB if not already loaded by config.php
if (!isset($pdo)) {
    require_once __DIR__ . '/../includes/db.php';
}

$stmt = $pdo->query("SELECT id, user_id, name, lat_long, status FROM users WHERE lat_long IS NOT NULL AND lat_long != '' LIMIT 50");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "COORDINATES IN DATABASE:\n";
foreach ($rows as $row) {
    echo "ID: {$row['id']} | UserID: {$row['user_id']} | Name: {$row['name']} | LatLong: '{$row['lat_long']}' | Status: {$row['status']}\n";
}
