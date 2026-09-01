<?php
// scratch/dump_phone_db.php
require_once __DIR__ . '/../includes/db_config.php';

try {
    $dsn = "mysql:host=100.94.147.63;dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 3
    ]);
    echo "SUCCESS: Connected to DB on 100.94.147.63\n";
    
    // Dump ip_phone_configs
    $configs = $pdo->query("SELECT * FROM ip_phone_configs")->fetchAll();
    echo "\n=== IP_PHONE_CONFIGS ===\n";
    print_r($configs);
    
    // Dump ip_phone_numbers
    $numbers = $pdo->query("SELECT * FROM ip_phone_numbers")->fetchAll();
    echo "\n=== IP_PHONE_NUMBERS ===\n";
    print_r($numbers);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
