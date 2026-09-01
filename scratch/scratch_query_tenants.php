<?php
require_once __DIR__ . '/../includes/config.php';

try {
    $stmt = $pdo->query("SELECT id, name, subdomain, db_name FROM tenants");
    $tenants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "--- ACTIVE TENANTS ---\n";
    foreach ($tenants as $t) {
        echo "ID: " . $t['id'] . " | Name: " . $t['name'] . " | Subdomain: " . $t['subdomain'] . " | DB: " . $t['db_name'] . "\n";
    }
} catch (Exception $e) {
    echo "DB Error: " . $e->getMessage() . "\n";
}
