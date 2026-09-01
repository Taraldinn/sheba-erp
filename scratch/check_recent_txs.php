<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';

try {
    $p = new PDO("mysql:host=$host;charset=utf8", $user, $pass);
    $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $dbs = $p->query("SHOW DATABASES")->fetchAll(PDO::FETCH_COLUMN);
    
    foreach ($dbs as $db) {
        if (strpos($db, 'shebafi_') === 0) {
            echo "=== Database: $db ===\n";
            try {
                // Check if transactions table exists
                $tableExists = false;
                try {
                    $p->query("SELECT 1 FROM `$db`.transactions LIMIT 1");
                    $tableExists = true;
                } catch (Exception $e) {}
                
                if ($tableExists) {
                    $last = $p->query("SELECT id, description, created_at FROM `$db`.transactions ORDER BY id DESC LIMIT 2")->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($last as $tx) {
                        echo "  Tx ID: {$tx['id']} | Desc: {$tx['description']} | Time: {$tx['created_at']}\n";
                    }
                } else {
                    echo "  No transactions table.\n";
                }
            } catch (Exception $e) {
                echo "  Error: " . $e->getMessage() . "\n";
            }
        }
    }
} catch (Exception $e) {
    echo "Global Error: " . $e->getMessage() . "\n";
}
