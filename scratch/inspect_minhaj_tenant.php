<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'shebafi_minhaj';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    echo "=== ROUTERS ===\n";
    $routers = $pdo->query("SELECT * FROM routers")->fetchAll();
    print_r($routers);
    
    echo "\n=== USER STATUS COUNT ===\n";
    $status_counts = $pdo->query("SELECT status, COUNT(*) as count FROM users GROUP BY status")->fetchAll();
    print_r($status_counts);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
