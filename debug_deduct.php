<?php
$_SERVER['HTTP_HOST'] = 'localhost'; // Manual simulation for CLI
require 'g:/ISP Sheba fi resource/2 March 2026/includes/config.php';
require 'g:/ISP Sheba fi resource/2 March 2026/includes/functions.php';

// Find the admin user
$admin = safeFetch($pdo, "SELECT * FROM " . TBL_STAFF . " WHERE LOWER(role) IN ('admin', 'super admin') LIMIT 1");

if ($admin) {
    echo "Admin User Found: ID=" . $admin['id'] . ", Role=[" . $admin['role'] . "], Balance=" . $admin['balance'] . "\n";
    
    // Check deductWallet
    $cost = 100;
    $res = deductWallet($pdo, $admin['id'], $cost);
    echo "deductWallet(ID=" . $admin['id'] . ", Cost=$cost) result: " . ($res ? "TRUE" : "FALSE") . "\n";
    
    // Check hasRole
    // hasRole uses SESSION
    $_SESSION['user_role'] = $admin['role'];
    echo "hasRole('Admin') result: " . (hasRole('Admin') ? "TRUE" : "FALSE") . "\n";
    echo "hasRole('SubReseller') result: " . (hasRole('SubReseller') ? "TRUE" : "FALSE") . "\n";
} else {
    echo "No Admin found in TBL_STAFF\n";
}
?>
