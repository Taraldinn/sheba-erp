<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'shebafi_ripa1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    echo "=== COLUMNS ===\n";
    $columns = $pdo->query("SHOW COLUMNS FROM users")->fetchAll();
    foreach ($columns as $col) {
        echo "{$col['Field']} - {$col['Type']}\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
