<?php
require_once 'includes/config.php';
require_once 'includes/functions.php';

echo "--- DATABASE DIAGNOSTICS ---\n";
echo "TBL_USERS: " . TBL_USERS . "\n";

try {
    $stmt = $pdo->query("SELECT id, user_id, phone, name, status FROM " . TBL_USERS . " LIMIT 10");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($users)) {
        echo "No users found in " . TBL_USERS . " table.\n";
    } else {
        foreach ($users as $u) {
            echo "ID: {$u['id']} | UserID: '{$u['user_id']}' | Phone: '{$u['phone']}' | Name: {$u['name']} | Status: {$u['status']}\n";
        }
    }
    
    // Check for any user to see column names
    $q = $pdo->query("DESCRIBE " . TBL_USERS);
    $cols = $q->fetchAll(PDO::FETCH_ASSOC);
    echo "\n--- COLUMNS ---\n";
    foreach($cols as $c) {
        echo "{$c['Field']} ({$c['Type']})\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
