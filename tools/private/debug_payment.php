<?php
require_once 'includes/config.php';
require_once 'includes/functions.php';

$user_id_str = 'ashiktest';
$u = safeFetch($pdo, "SELECT * FROM users WHERE user_id = ?", [$user_id_str]);

if ($u) {
    echo "<h3>User State: ashiktest</h3>";
    echo "<pre>";
    print_r([
        'id' => $u['id'],
        'status' => $u['status'],
        'bill_amount' => $u['bill_amount'],
        'due' => $u['due'],
        'current_bill_date' => $u['current_bill_date'],
        'manager_id' => $u['manager_id']
    ]);
    echo "</pre>";

    echo "<h3>Recent Logs (last 5):</h3>";
    $logs = safeFetchAll($pdo, "SELECT * FROM logs WHERE target_id = ? ORDER BY id DESC LIMIT 5", [$u['id']]);
    echo "<pre>";
    print_r($logs);
    echo "</pre>";

    echo "<h3>Recent Finance (last 5):</h3>";
    $finance = safeFetchAll($pdo, "SELECT * FROM finance ORDER BY id DESC LIMIT 5");
    echo "<pre>";
    print_r($finance);
    echo "</pre>";

    echo "<h3>Recent Transactions (last 5):</h3>";
    $tx = safeFetchAll($pdo, "SELECT * FROM transactions ORDER BY id DESC LIMIT 5");
    echo "<pre>";
    print_r($tx);
    echo "</pre>";
    
    echo "<h3>Online Pay Entries (last 5):</h3>";
    $online = safeFetchAll($pdo, "SELECT * FROM online_payments ORDER BY staff_id = ? OR payment_id LIKE '%ashik%' ORDER BY id DESC LIMIT 5", [$u['id']]);
    echo "<pre>";
    print_r($online);
    echo "</pre>";
} else {
    echo "User not found.";
}
?>
