<?php
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../classes/MikrotikApp.php';
require_once __DIR__ . '/../controllers/logic.php';

try {
    echo "Calling get_global_online_users...\n";
    $res = get_global_online_users($pdo, true);
    echo "Returned: " . count($res) . " users\n";
    if (count($res) > 0) {
        echo "First 5 keys: \n";
        print_r(array_slice(array_keys($res), 0, 5));
    }
} catch (Exception $e) {
    echo "Exception: " . $e->getMessage() . "\n";
}
