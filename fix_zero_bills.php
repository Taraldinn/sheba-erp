<?php
require_once __DIR__ . '/includes/db.php';

try {
    // 1. Find users with 0 bill_amount
    $stmt = $pdo->query("SELECT u.id, u.user_id, u.user_package, s.price 
                         FROM ".TBL_USERS." u
                         JOIN ".TBL_SERVICES." s ON u.user_package = s.name
                         WHERE u.bill_amount <= 0 AND u.status IN ('Active', 'Due')");
    $users = $stmt->fetchAll();

    echo "Found " . count($users) . " active/due users with zero bill amount.\n";
    $fixed = 0;

    foreach ($users as $u) {
        $price = floatval($u['price']);
        if ($price > 0) {
            $update = $pdo->prepare("UPDATE ".TBL_USERS." SET bill_amount = ? WHERE id = ?");
            if ($update->execute([$price, $u['id']])) {
                echo "Fixed User: {$u['user_id']} | Package: {$u['user_package']} | New Bill Amount: {$price}\n";
                $fixed++;
            }
        }
    }

    echo "\nSuccessfully fixed {$fixed} users.\n";

} catch (Exception $e) {
    die("Error: " . $e->getMessage());
}
