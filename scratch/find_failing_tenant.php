<?php
$tenants_dir = __DIR__ . '/../includes/tenants';
$tenant_files = glob($tenants_dir . '/*.php');

foreach ($tenant_files as $file) {
    $tenant_name = basename($file, '.php');
    if ($tenant_name === '.htaccess') continue;
    
    // Load config manually to avoid redefining constants
    $content = file_get_contents($file);
    $db_name = '';
    $db_user = '';
    $db_pass = '';
    
    if (preg_match("/define\('DB_NAME',\s*'([^']+)'\)/", $content, $m_db) &&
        preg_match("/define\('DB_USER',\s*'([^']+)'\)/", $content, $m_user) &&
        preg_match("/define\('DB_PASS',\s*'([^']*)'\)/", $content, $m_pass)) {
        
        $db_name = $m_db[1];
        $db_user = $m_user[1];
        $db_pass = $m_pass[1];
    } else {
        continue;
    }
    
    try {
        $pdo = new PDO("mysql:host=127.0.0.1;dbname=$db_name;charset=utf8", 'root', '');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Count routers
        $stmt = $pdo->query("SELECT COUNT(*) FROM routers");
        $routers_count = $stmt->fetchColumn();
        
        // Count active users
        $stmt = $pdo->query("SELECT COUNT(*) FROM users WHERE status IN ('Active', 'Promise Active')");
        $users_count = $stmt->fetchColumn();
        
        // Check cache file
        $cache_file = __DIR__ . '/../cache/global_online_' . $tenant_name . '.json';
        $cache_users_count = 'N/A';
        $cache_exists = file_exists($cache_file);
        if ($cache_exists) {
            $data = json_decode(file_get_contents($cache_file), true);
            $cache_users_count = is_array($data) ? count($data) : 'invalid';
        }
        
        echo "Tenant: $tenant_name | DB: $db_name | Routers: $routers_count | Active Users: $users_count | Cache file: " . ($cache_exists ? "YES ($cache_users_count users)" : "NO") . "\n";
        
    } catch (Exception $e) {
        echo "Tenant: $tenant_name | DB: $db_name | Error: " . $e->getMessage() . "\n";
    }
}
