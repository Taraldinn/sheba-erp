<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;charset=utf8", $user, $pass);
    $dbs = $pdo->query("SHOW DATABASES")->fetchAll(PDO::FETCH_COLUMN);
    
    foreach ($dbs as $db) {
        if (in_array($db, ['information_schema', 'mysql', 'performance_schema', 'sys', 'phpmyadmin'])) continue;
        
        try {
            $pdo->exec("USE `$db`");
            // Check if audit_log exists and has Recharge actions
            $stmt = $pdo->query("SELECT COUNT(*) FROM audit_log WHERE action_type='Recharge'");
            $count = $stmt->fetchColumn();
            if ($count > 0) {
                echo "DATABASE '$db' has $count recharge logs!\n";
                // Get a sample user and a sample log
                $sample_log = $pdo->query("SELECT id, target_id, description, timestamp FROM audit_log WHERE action_type='Recharge' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
                echo "  Sample Log: ID={$sample_log['id']}, Target={$sample_log['target_id']}, Date={$sample_log['timestamp']}, Desc={$sample_log['description']}\n";
                
                // Get user info for target_id
                $user_info = $pdo->query("SELECT id, user_id, name FROM users WHERE id=" . intval($sample_log['target_id']))->fetch(PDO::FETCH_ASSOC);
                if ($user_info) {
                    echo "  Corresponding User: ID={$user_info['id']}, UserID={$user_info['user_id']}, Name={$user_info['name']}\n";
                } else {
                    echo "  No corresponding user found for target_id {$sample_log['target_id']}.\n";
                }
            }
        } catch (Exception $e) {
            // Table doesn't exist or other error, ignore
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
