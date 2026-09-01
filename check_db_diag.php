<?php
require_once 'includes/db.php';
require_once 'includes/db_config.php';
require_once 'includes/functions.php';

echo "Current Session User ID: " . ($_SESSION['admin_id'] ?? 'Not set') . "\n";
echo "Current Session Role: " . ($_SESSION['user_role'] ?? 'Not set') . "\n";

$stmt = $pdo->query("SELECT id, name, username, role, parent_id, supervisor_id, status FROM " . TBL_STAFF);
$staff = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "\n--- STAFF TABLE ---\n";
foreach ($staff as $s) {
    echo "ID: {$s['id']} | Name: {$s['name']} | Username: {$s['username']} | Role: {$s['role']} | Parent: {$s['parent_id']} | Supervisor: {$s['supervisor_id']} | Status: {$s['status']}\n";
}

$stmt = $pdo->query("SELECT id, name, role FROM " . TBL_STAFF . " WHERE role IN ('Admin', 'Super Admin', 'Supervisor')");
$parents = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "\n--- POTENTIAL PARENTS ---\n";
foreach ($parents as $p) {
    echo "ID: {$p['id']} | Name: {$p['name']} | Role: {$p['role']}\n";
}
?>
