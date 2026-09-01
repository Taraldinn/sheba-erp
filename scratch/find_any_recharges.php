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
            $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            
            foreach ($tables as $table) {
                // Check if table contains text 'recharge' or 'payment' in name
                if (stripos($table, 'recharge') !== false || stripos($table, 'payment') !== false || stripos($table, 'invoice') !== false || stripos($table, 'bill') !== false || stripos($table, 'log') !== false || stripos($table, 'trans') !== false) {
                    // Get columns
                    $cols = $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);
                    echo "Database: $db | Table: $table | Columns: " . implode(', ', $cols) . "\n";
                    
                    // Check row count
                    $count = $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
                    echo "  Row count: $count\n";
                }
            }
        } catch (Exception $e) {
            // Ignore database or table error
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
