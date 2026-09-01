<?php
require_once dirname(__DIR__) . '/../includes/db_config.php';
try {
    $masterPdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    $stmt = $masterPdo->query("SELECT token_hash FROM api_tokens WHERE tenant_id = 2");
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
