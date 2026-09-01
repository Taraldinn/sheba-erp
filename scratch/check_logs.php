<?php
$host = '127.0.0.1';
$db = 'shebafi_minhaj';
$user = 'shebafi_minhaj';
$pass = 'Mother519466@';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Connected successfully to database $db!\n";

    // Let's get the last 50 logs from audit_log
    $stmt = $pdo->query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 50");
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Recent Logs:\n";
    foreach ($logs as $log) {
        echo "[{$log['timestamp']}] [{$log['action_type']}] Target ID: {$log['target_id']} - Admin: {$log['admin_username']} - Msg: {$log['description']}\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
