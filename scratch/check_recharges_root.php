<?php

$host = '127.0.0.1';
$db = 'shebafi_minhaj';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Connected successfully to database as root!\n";
    
    echo "=== USERS ===\n";
    $users = $pdo->query("SELECT id, user_id, name, bill_amount FROM users LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($users as $u) {
        echo "ID: {$u['id']} | User ID: {$u['user_id']} | Name: {$u['name']} | Bill: {$u['bill_amount']}\n";
    }

    echo "\n=== RECHARGE LOGS (audit_log) ===\n";
    $logs = $pdo->query("SELECT id, target_id, description, timestamp FROM audit_log WHERE action_type='Recharge' ORDER BY timestamp DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    if (empty($logs)) {
        echo "No recharge logs found!\n";
    } else {
        foreach ($logs as $l) {
            echo "Log ID: {$l['id']} | Target ID: {$l['target_id']} | Date: {$l['timestamp']} | Desc: {$l['description']}\n";
        }
    }
} catch (Exception $e) {
    echo "Connection as root failed: " . $e->getMessage() . "\n";
}
