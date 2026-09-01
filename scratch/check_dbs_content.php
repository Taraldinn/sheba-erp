<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';

$dbs = ['isp', 'isp_enterprise_v2'];
foreach ($dbs as $db) {
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        echo "=== Connected successfully to database '$db' ===\n";
        
        // Check if users table exists
        $tbl_users_exists = false;
        try {
            $pdo->query("SELECT 1 FROM users LIMIT 1");
            $tbl_users_exists = true;
            echo "Table 'users' exists.\n";
        } catch (Exception $e) {
            echo "Table 'users' does not exist.\n";
        }
        
        // Check if audit_log exists
        $tbl_log_exists = false;
        try {
            $pdo->query("SELECT 1 FROM audit_log LIMIT 1");
            $tbl_log_exists = true;
            echo "Table 'audit_log' exists.\n";
        } catch (Exception $e) {
            echo "Table 'audit_log' does not exist.\n";
        }

        if ($tbl_users_exists) {
            $users = $pdo->query("SELECT id, user_id, name, bill_amount FROM users LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
            echo "Users sample:\n";
            foreach ($users as $u) {
                echo "  ID: {$u['id']} | User ID: {$u['user_id']} | Name: {$u['name']} | Bill: {$u['bill_amount']}\n";
            }
        }
        
        if ($tbl_log_exists) {
            $logs = $pdo->query("SELECT id, target_id, action_type, description, timestamp FROM audit_log WHERE action_type='Recharge' ORDER BY timestamp DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
            echo "Recharge logs sample:\n";
            if (empty($logs)) {
                echo "  No recharge logs found.\n";
            } else {
                foreach ($logs as $l) {
                    echo "  Log ID: {$l['id']} | Target ID: {$l['target_id']} | Action: {$l['action_type']} | Date: {$l['timestamp']} | Desc: {$l['description']}\n";
                }
            }
        }
    } catch (Exception $e) {
        echo "Failed to connect to '$db': " . $e->getMessage() . "\n";
    }
}
