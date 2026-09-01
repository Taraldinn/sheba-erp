<?php
require_once __DIR__ . '/../includes/db_config.php';
try {
    echo "Connecting to localhost...\n";
    $pdo1 = new PDO("mysql:host=localhost;dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    echo "Success with localhost!\n";
} catch (Exception $e) {
    echo "Failed with localhost: " . $e->getMessage() . "\n";
}

try {
    echo "Connecting to 127.0.0.1...\n";
    $pdo2 = new PDO("mysql:host=127.0.0.1;dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    echo "Success with 127.0.0.1!\n";
} catch (Exception $e) {
    echo "Failed with 127.0.0.1: " . $e->getMessage() . "\n";
}
?>
