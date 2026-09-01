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
            $count = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
            if ($count > 0) {
                echo "DATABASE '$db' has $count users in 'users' table!\n";
                // Print a sample of users
                $users = $pdo->query("SELECT id, user_id, name, bill_amount FROM users LIMIT 3")->fetchAll(PDO::FETCH_ASSOC);
                foreach ($users as $u) {
                    echo "  User: ID={$u['id']} | UserID={$u['user_id']} | Name={$u['name']}\n";
                }
            }
        } catch (Exception $e) {
            // Table doesn't exist or other error, ignore
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
