<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'shebafi_ripa1';

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
    
    echo "\n=== USER ROUTER MAP ===\n";
    $router_counts = $pdo->query("SELECT router_id, COUNT(*) as count FROM users GROUP BY router_id")->fetchAll();
    print_r($router_counts);
    
    echo "\n=== SAMPLE USERS ===\n";
    $users = $pdo->query("SELECT id, user_id, name, status, router_id FROM users LIMIT 10")->fetchAll();
    print_r($users);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
