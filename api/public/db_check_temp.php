<?php
require_once dirname(__DIR__) . '/../includes/db_config.php';
try {
    $masterPdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    $stmt = $masterPdo->query("SELECT id, name, subdomain, db_name, db_user, db_pass FROM tenants WHERE id = 2");
    print_r($stmt->fetch(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
