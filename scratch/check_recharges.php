<?php
require_once __DIR__ . '/../includes/config.php';

echo "=== USERS ===\n";
$users = safeFetchAll($pdo, "SELECT id, user_id, name, bill_amount FROM " . TBL_USERS . " LIMIT 10");
foreach ($users as $u) {
    echo "ID: {$u['id']} | User ID: {$u['user_id']} | Name: {$u['name']} | Bill: {$u['bill_amount']}\n";
}

echo "\n=== RECHARGE LOGS (audit_log) ===\n";
$logs = safeFetchAll($pdo, "SELECT id, target_id, description, timestamp FROM " . TBL_LOGS . " WHERE action_type='Recharge' ORDER BY timestamp DESC LIMIT 10");
if (empty($logs)) {
    echo "No recharge logs found in TBL_LOGS!\n";
} else {
    foreach ($logs as $l) {
        echo "Log ID: {$l['id']} | Target ID: {$l['target_id']} | Date: {$l['timestamp']} | Desc: {$l['description']}\n";
    }
}

echo "\n=== ALL DISTINCT ACTION TYPES ===\n";
$actions = safeFetchAll($pdo, "SELECT DISTINCT action_type FROM " . TBL_LOGS);
foreach ($actions as $a) {
    echo "Action: {$a['action_type']}\n";
}
