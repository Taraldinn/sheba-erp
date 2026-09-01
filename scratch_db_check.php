<?php
require_once __DIR__ . '/includes/tenant.php';

echo "Main DB Schema:\n";
require_once __DIR__ . '/includes/db_config.php';
try {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stmt = $pdo->query("DESCRIBE olts");
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

$tenants = ['beeonline', 'billing', 'bntc', 'mac', 'minhaj', 'optihub'];
foreach ($tenants as $t) {
    echo "\nTenant '$t' DB Schema:\n";
    $config_file = __DIR__ . '/includes/tenants/' . $t . '.php';
    if (file_exists($config_file)) {
        unset($pdo);
        // Clear defined constants by using variables
        $config_content = file_get_contents($config_file);
        preg_match("/define\('DB_HOST',\s*'([^']+)'\)/", $config_content, $m_host);
        preg_match("/define\('DB_NAME',\s*'([^']+)'\)/", $config_content, $m_db);
        preg_match("/define\('DB_USER',\s*'([^']+)'\)/", $config_content, $m_user);
        preg_match("/define\('DB_PASS',\s*'([^']*)'\)/", $config_content, $m_pass);
        
        $host = $m_host[1] ?? '';
        $db = $m_db[1] ?? '';
        $user = $m_user[1] ?? '';
        $pass = $m_pass[1] ?? '';
        
        try {
            $dsn = "mysql:host=$host;dbname=$db;charset=utf8";
            $pdo = new PDO($dsn, $user, $pass);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $stmt = $pdo->query("DESCRIBE olts");
            print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (Exception $e) {
            echo "Error: " . $e->getMessage() . "\n";
        }
    }
}
