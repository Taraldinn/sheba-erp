<?php
$host = '127.0.0.1';
$user = 'root';
$pass = '';

$dbs = ['erp_system', 'erp_wholesale', 'isp_enterprise_v2', 'muskan', 'muskan_tenant_1', 'muskan_tenant_2', 'olt_monitor', 'oltm', 'school_db'];

foreach ($dbs as $db) {
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
        $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        echo "=== TABLES IN $db ===\n";
        echo implode(', ', $tables) . "\n\n";
    } catch (Exception $e) {
        echo "Error in $db: " . $e->getMessage() . "\n\n";
    }
}
