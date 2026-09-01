<?php
// check_tokens.php
require_once __DIR__ . '/includes/db_config.php';
try {
    $masterPdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8", DB_USER, DB_PASS);
    $stmt = $masterPdo->query("SELECT t.id, t.name, t.subdomain, a.token_hash FROM tenants t JOIN api_tokens a ON t.id = a.tenant_id");
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
