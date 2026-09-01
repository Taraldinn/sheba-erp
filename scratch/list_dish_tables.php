<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'dish';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "=== TABLES IN $db ===\n";
    foreach ($tables as $t) {
        echo $t . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
