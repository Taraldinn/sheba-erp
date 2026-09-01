<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'shebafi_ripa1';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "=== ROUTERS COLUMNS ===\n";
    $columns = $pdo->query("SHOW COLUMNS FROM routers")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($columns as $col) {
        echo "{$col['Field']} - {$col['Type']}\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
