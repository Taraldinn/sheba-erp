<?php
require_once 'includes/config.php';
require_once 'includes/functions.php';

$user_id_str = 'ashiktest';
$u = safeFetch($pdo, "SELECT * FROM users WHERE user_id = ?", [$user_id_str]);

if ($u) {
    echo "<h3>User: {$u['user_id']}</h3>";
    echo "Name: {$u['name']}<br>";
    echo "Status: {$u['status']}<br>";
    echo "Bill Amount: {$u['bill_amount']}<br>";
    echo "Due: {$u['due']}<br>";
    echo "Expiry: {$u['current_bill_date']}<br>";
    echo "Package: {$u['user_package']}<br>";
    
    $svc = safeFetch($pdo, "SELECT * FROM mikrotik_services WHERE name = ?", [$u['user_package']]);
    if ($svc) {
        echo "<h4>Package Details:</h4>";
        echo "Price: {$svc['price']}<br>";
        echo "Buying Price: {$svc['buying_price']}<br>";
    }
} else {
    echo "User not found.";
}
?>
