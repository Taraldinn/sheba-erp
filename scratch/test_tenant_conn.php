<?php
try {
    echo "Including billing tenant config...\n";
    require_once __DIR__ . '/../includes/tenants/billing.php';
    echo "Host: " . DB_HOST . ", DB: " . DB_NAME . ", User: " . DB_USER . ", Pass: " . DB_PASS . "\n";
    
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    echo "Success connecting with defined host!\n";
} catch (Exception $e) {
    echo "Failed with defined host: " . $e->getMessage() . "\n";
}

try {
    $dsn = "mysql:host=127.0.0.1;dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    echo "Success connecting with 127.0.0.1!\n";
} catch (Exception $e) {
    echo "Failed with 127.0.0.1: " . $e->getMessage() . "\n";
}
?>
