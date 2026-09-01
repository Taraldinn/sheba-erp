<?php
// seed_tenant.php

// 1. Load config/db to get current tenant connection
define('TENANT_OVERRIDE', 'billing');
require_once __DIR__ . '/includes/config.php';

// 2. Fetch Master DB connection details from api/.env
$envPath = __DIR__ . '/api/.env';
$masterHost = '127.0.0.1'; $masterDb = ''; $masterUser = ''; $masterPass = ''; $masterPort = 3306;
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name); $value = trim($value);
        if ($name == 'MASTER_DB_HOST') $masterHost = $value;
        if ($name == 'MASTER_DB_NAME') $masterDb = $value;
        if ($name == 'MASTER_DB_USER') $masterUser = $value;
        if ($name == 'MASTER_DB_PASS') $masterPass = $value;
        if ($name == 'MASTER_DB_PORT') $masterPort = intval($value);
    }
}

try {
    $masterPdo = new PDO("mysql:host=" . $masterHost . ";port=" . $masterPort . ";dbname=" . $masterDb . ";charset=utf8", $masterUser, $masterPass);
    $masterPdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $masterPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Exception $e) {
    die("Master DB Connection Failed: " . $e->getMessage());
}

$tenant_name = 'billing';
$db_name = DB_NAME; // shebafi_ripa1
$db_user = DB_USER;
$db_pass = DB_PASS;
$hmac = bin2hex(random_bytes(16));

try {
    // 1. Insert/Update Tenant DB
    $localTenant = safeFetch($pdo, "SELECT id FROM tenants LIMIT 1");
    if ($localTenant) {
        $pdo->prepare("UPDATE tenants SET subdomain = ? WHERE id = ?")->execute([$tenant_name, $localTenant['id']]);
        $hmac = safeFetch($pdo, "SELECT hmac_secret FROM tenants WHERE id = ?", [$localTenant['id']])['hmac_secret'];
        echo "Updated local tenant database.\n";
    } else {
        $pdo->prepare("INSERT INTO tenants (name, subdomain, db_name, db_user, db_pass, hmac_secret, status) VALUES (?, ?, ?, ?, ?, ?, 'active')")
            ->execute(['Billing Tenant', $tenant_name, $db_name, $db_user, $db_pass, $hmac]);
        echo "Inserted into local tenant database.\n";
    }

    // 2. Insert/Update Master DB
    $masterTenant = safeFetch($masterPdo, "SELECT id FROM tenants WHERE name = ? OR subdomain = ? LIMIT 1", ['Billing Tenant', $tenant_name]);
    if ($masterTenant) {
        $masterPdo->prepare("UPDATE tenants SET subdomain = ?, db_name = ?, db_user = ?, db_pass = ?, hmac_secret = ? WHERE id = ?")
                  ->execute([$tenant_name, $db_name, $db_user, $db_pass, $hmac, $masterTenant['id']]);
        echo "Updated master database tenant record.\n";
    } else {
        $masterPdo->prepare("INSERT INTO tenants (name, subdomain, db_name, db_user, db_pass, hmac_secret, status) VALUES (?, ?, ?, ?, ?, ?, 'active')")
                  ->execute(['Billing Tenant', $tenant_name, $db_name, $db_user, $db_pass, $hmac]);
        echo "Inserted into master database tenant record.\n";
    }

    echo "Success: Tenant 'billing' registered successfully in Master Database!\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
