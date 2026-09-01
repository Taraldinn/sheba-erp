<?php
// Safety Check
if (php_sapi_name() !== 'cli') {
    // Basic auth or just a secret key
    if (($_GET['key'] ?? '') !== 'secret123') {
        die("Unauthorized");
    }
}

require_once 'includes/db.php';

try {
    $count1 = $pdo->exec("UPDATE users SET status = 'Expire' WHERE status = 'Due'");
    $count2 = $pdo->exec("UPDATE users SET bill_position = 'Expire' WHERE bill_position = 'Due'");

    echo "<h1>Migration Success!</h1>";
    echo "<p>Records updated (status): $count1</p>";
    echo "<p>Records updated (bill_position): $count2</p>";
} catch (Exception $e) {
    echo "<h1>Migration Failed!</h1>";
    echo "<p>" . $e->getMessage() . "</p>";
}
