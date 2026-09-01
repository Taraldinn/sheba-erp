<?php
// Debug script to check roles in DB
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';

$stmt = $pdo->query("SELECT id, username, role FROM ".TBL_STAFF);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "<h2>Staff Roles:</h2><ul>";
foreach($users as $u) {
    echo "<li>ID: {$u['id']} - Name: {$u['username']} - Role: '{$u['role']}'</li>";
}
echo "</ul>";

echo "<h2>Session:</h2><pre>";
print_r($_SESSION);
echo "</pre>";

if(hasRole('Admin')) { echo "<h3>Current User HAS 'Admin' Role</h3>"; } 
else { echo "<h3>Current User DOES NOT HAVE 'Admin' Role</h3>"; }
?>
