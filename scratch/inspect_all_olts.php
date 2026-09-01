<?php
require_once __DIR__ . '/../includes/config.php';

$tenants_dir = __DIR__ . '/../includes/tenants/';
$tenant_files = glob($tenants_dir . '*.php');

echo "=== CHECKING MAIN DATABASE OLTs ===\n";
check_db_olts('Main System', DB_HOST, DB_NAME, DB_USER, DB_PASS);

foreach ($tenant_files as $file) {
    $tenant_name = basename($file, '.php');
    if ($tenant_name === '.htaccess') continue;
    
    // Parse tenant config manually to avoid constant redeclaration conflicts
    $content = file_get_contents($file);
    if (preg_match("/define\('DB_HOST',\s*'([^']+)'\)/", $content, $m_host) &&
        preg_match("/define\('DB_NAME',\s*'([^']+)'\)/", $content, $m_name) &&
        preg_match("/define\('DB_USER',\s*'([^']+)'\)/", $content, $m_user) &&
        preg_match("/define\('DB_PASS',\s*'([^']*)'\)/", $content, $m_pass)) {
        
        echo "\n=== CHECKING TENANT DATABASE OLTs: $tenant_name ===\n";
        check_db_olts($tenant_name, $m_host[1], $m_name[1], $m_user[1], $m_pass[1]);
    }
}

function check_db_olts($label, $host, $db, $user, $pass) {
    try {
        $dsn = "mysql:host=$host;dbname=$db;charset=utf8";
        $test_pdo = new PDO($dsn, $user, $pass);
        $test_pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        $stmt = $test_pdo->query("SELECT id, staff_id, name, ip, brand FROM olts");
        $olts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo "Database: $db (Total OLTs: " . count($olts) . ")\n";
        foreach ($olts as $o) {
            echo " - ID: {$o['id']}, Staff ID: {$o['staff_id']}, Name: {$o['name']}, IP: {$o['ip']}, Brand: {$o['brand']}\n";
        }
    } catch (Exception $e) {
        echo "Error connecting to $db: " . $e->getMessage() . "\n";
    }
}
?>
