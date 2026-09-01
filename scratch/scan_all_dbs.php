<?php
$dbs = ['ample', 'betternet4', 'ctggraphics_webiptv', 'inventory', 'inventory2', 'inventorymgtci', 'ispcrm', 'perfex', 'qtv_qtv', 'sms_db'];

foreach ($dbs as $db) {
    try {
        $pdo = new PDO("mysql:host=127.0.0.1;dbname=$db;charset=utf8", "root", "");
        
        // Count staff
        $stmt = $pdo->query("SHOW TABLES LIKE 'staff'");
        if ($stmt->fetch()) {
            $staff = $pdo->query("SELECT id, name, username, role FROM staff")->fetchAll(PDO::FETCH_ASSOC);
            echo "=== Database: $db ===\n";
            echo "Staff count: " . count($staff) . "\n";
            foreach ($staff as $s) {
                echo "  - ID {$s['id']}: {$s['username']} ({$s['name']}) - Role: {$s['role']}\n";
            }
            
            // Count users (clients)
            $stmt = $pdo->query("SHOW TABLES LIKE 'users'");
            if ($stmt->fetch()) {
                $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
                echo "Users count: $userCount\n";
                if ($userCount > 0) {
                    $sample = $pdo->query("SELECT id, name, user_id, phone, status, current_bill_date, manager_id FROM users LIMIT 3")->fetchAll(PDO::FETCH_ASSOC);
                    print_r($sample);
                }
            }
            echo "\n";
        }
    } catch (Exception $e) {
        // Skip
    }
}
?>
