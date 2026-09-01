<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';
$db = 'cambd';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "=== TABLES IN $db ===\n";
    echo implode(', ', $tables) . "\n\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
