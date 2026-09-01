<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/MikrotikApp.php';
require_once __DIR__ . '/../controllers/logic.php';

try {
    $online_data = get_global_online_users($pdo, true);
    $online_keys = array_keys($online_data);
    $online_set = array_flip($online_keys); // case-sensitive lookup
    
    echo "Total Online: " . count($online_keys) . "\n";
    
    $users = safeFetchAll($pdo, "SELECT id, user_id, name, status FROM users WHERE status IN ('Active', 'Promise Active')");
    echo "Total Active/Promise Active Users in DB: " . count($users) . "\n";
    
    $matched = 0;
    $mismatched = [];
    foreach ($users as $u) {
        $uid = $u['user_id'];
        if (isset($online_set[$uid])) {
            $matched++;
        } else {
            $mismatched[] = $uid;
        }
    }
    
    echo "Matched: $matched / " . count($users) . "\n";
    if (count($mismatched) > 0) {
        echo "Sample mismatched user_ids (first 10):\n";
        print_r(array_slice($mismatched, 0, 10));
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
