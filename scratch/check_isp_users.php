<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'isp';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Connected successfully to '$db'.\n";

    echo "=== USERS IN isp ===\n";
    $users = $pdo->query("SELECT id, user_id, name, phone, user_package, status, current_bill_date FROM users")->fetchAll(PDO::FETCH_ASSOC);
    if (empty($users)) {
        echo "No users found in database 'isp'.\n";
    } else {
        foreach ($users as $u) {
            echo "ID: {$u['id']} | UserID: {$u['user_id']} | Name: {$u['name']} | Package: {$u['user_package']} | Status: {$u['status']} | Expiry: {$u['current_bill_date']}\n";
        }
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
