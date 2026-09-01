<?php
try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=shebafi_minhaj;charset=utf8", "shebafi_minhaj", "Mother519466@");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt1 = $pdo->prepare("UPDATE users SET status = 'Expire' WHERE status = 'Due'");
    $stmt1->execute();
    $count1 = $stmt1->rowCount();

    $stmt2 = $pdo->prepare("UPDATE users SET bill_position = 'Expire' WHERE bill_position = 'Due'");
    $stmt2->execute();
    $count2 = $stmt2->rowCount();

    echo "Migration Success!\n";
    echo "Records updated (status): $count1\n";
    echo "Records updated (bill_position): $count2\n";
} catch (Exception $e) {
    echo "Migration Failed: " . $e->getMessage() . "\n";
}
