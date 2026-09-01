<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'isp';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Connected successfully to '$db'.\n";

    echo "=== DISTINCT ACTION TYPES IN audit_log ===\n";
    $actions = $pdo->query("SELECT action_type, COUNT(*) as cnt FROM audit_log GROUP BY action_type")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($actions as $a) {
        echo "Action: {$a['action_type']} | Count: {$a['cnt']}\n";
    }

    echo "\n=== RECENT audit_log ENTRIES ===\n";
    $logs = $pdo->query("SELECT id, action_type, target_id, description, timestamp FROM audit_log ORDER BY timestamp DESC LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($logs as $l) {
        echo "ID: {$l['id']} | Action: {$l['action_type']} | Target: {$l['target_id']} | Date: {$l['timestamp']} | Desc: {$l['description']}\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
