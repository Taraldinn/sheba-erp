<?php
$host = 'localhost';
$db = 'shebafi_minhaj';
$user = 'shebafi_minhaj';
$pass = 'Mother519466@';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    echo "=== USER INFO FOR RX0002 ===\n";
    $stmt = $pdo->prepare("SELECT * FROM users WHERE user_id = ? OR name LIKE ?");
    $stmt->execute(['RX0002', '%Mohammed Habibur%']);
    $users = $stmt->fetchAll();
    foreach ($users as $u) {
        print_r($u);
    }

    echo "\n=== SCHEMA FOR USERS ===\n";
    $stmt = $pdo->query("DESCRIBE users");
    while ($row = $stmt->fetch()) {
        echo "{$row['Field']} - {$row['Type']}\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
