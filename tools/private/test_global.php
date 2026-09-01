<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

echo "Testing get_global_opt...\n";
$bk_key = get_global_opt('bkash_app_key');
echo "bKash App Key: " . ($bk_key ? "FOUND" : "NOT FOUND/EMPTY") . "\n";

$mpdo = get_master_pdo();
if ($mpdo) {
    echo "Master PDO: CONNECTED\n";
    $stmt = $mpdo->query("SELECT DATABASE()");
    echo "Master DB Name: " . $stmt->fetchColumn() . "\n";
} else {
    echo "Master PDO: FAILED\n";
}
