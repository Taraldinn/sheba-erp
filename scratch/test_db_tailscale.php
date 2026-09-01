<?php
require_once __DIR__ . '/../includes/db_config.php';

try {
    $dsn = "mysql:host=100.94.147.63;dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5
    ]);
    echo "SUCCESS: Connected to DB on 100.94.147.63\n\n";

    $stmt = $pdo->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables in DB:\n";
    foreach ($tables as $table) {
        if (strpos($table, 'store') !== false) {
            echo " - [STORE] $table\n";
        } else {
            echo " - $table\n";
        }
    }
} catch (Exception $e) {
    echo "Connection Error: " . $e->getMessage() . "\n";
}
?>
