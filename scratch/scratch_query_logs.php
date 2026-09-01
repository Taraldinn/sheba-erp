<?php
$host = '127.0.0.1';
$db = 'shebafi_minhaj';
$user = 'shebafi_minhaj';
$pass = 'Mother519466@';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Connected successfully!\n";

    // Query TBL_LOGS
    $stmt = $pdo->prepare("SELECT * FROM audit_log WHERE description LIKE :q1 OR description LIKE :q2 OR action_type = 'Password Mismatch' ORDER BY id DESC LIMIT 50");
    $stmt->execute([
        ':q1' => '%mikrotik%',
        ':q2' => '%mismatch%'
    ]);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "Matching Logs count: " . count($logs) . "\n";
    foreach ($logs as $log) {
        echo "[{$log['timestamp']}] [{$log['action_type']}] ID: {$log['target_id']} - Msg: {$log['description']}\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
