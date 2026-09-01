<?php
/**
 * scratch/cleanup_olts.php
 * One-time clean-up migration to delete leaked OLTs across tenant databases.
 */

require_once __DIR__ . '/../includes/config.php';

$tenants_dir = __DIR__ . '/../includes/tenants/';
$tenant_files = glob($tenants_dir . '*.php');

echo "=== CLEANING MAIN DATABASE ===\n";
cleanup_db_olts('Main System', DB_HOST, DB_NAME, DB_USER, DB_PASS);

foreach ($tenant_files as $file) {
    $tenant_name = basename($file, '.php');
    if ($tenant_name === '.htaccess') continue;
    
    // Parse tenant config manually to avoid constant redeclaration conflicts
    $content = file_get_contents($file);
    if (preg_match("/define\('DB_HOST',\s*'([^']+)'\)/", $content, $m_host) &&
        preg_match("/define\('DB_NAME',\s*'([^']+)'\)/", $content, $m_name) &&
        preg_match("/define\('DB_USER',\s*'([^']+)'\)/", $content, $m_user) &&
        preg_match("/define\('DB_PASS',\s*'([^']*)'\)/", $content, $m_pass)) {
        
        echo "\n=== CLEANING TENANT DATABASE: $tenant_name ===\n";
        cleanup_db_olts($tenant_name, $m_host[1], $m_name[1], $m_user[1], $m_pass[1]);
    }
}

function cleanup_db_olts($label, $host, $db, $user, $pass) {
    try {
        $dsn = "mysql:host=$host;dbname=$db;charset=utf8";
        $test_pdo = new PDO($dsn, $user, $pass);
        $test_pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Find existing columns in the table to be safe
        $cols = $test_pdo->query("DESCRIBE olts")->fetchAll(PDO::FETCH_COLUMN);
        $has_ip = in_array('ip', $cols);
        $has_ip_address = in_array('ip_address', $cols);
        
        $delete_count = 0;
        
        if (strpos($db, 'ripa1') !== false || $label === 'billing') {
            // Billing / Ripa's DB -> Delete all OLTs EXCEPT Ripa's own IP
            if ($has_ip && $has_ip_address) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip != ? AND ip_address != ?");
                $stmt->execute(['103.135.253.112', '103.135.253.112']);
            } elseif ($has_ip) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip != ?");
                $stmt->execute(['103.135.253.112']);
            } elseif ($has_ip_address) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip_address != ?");
                $stmt->execute(['103.135.253.112']);
            }
            $delete_count = $stmt->rowCount();
        } elseif (strpos($db, 'bntc') !== false || $label === 'bntc') {
            // bntc's DB -> Delete all OLTs EXCEPT bntc's own IP
            if ($has_ip && $has_ip_address) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip != ? AND ip_address != ?");
                $stmt->execute(['172.25.29.18', '172.25.29.18']);
            } elseif ($has_ip) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip != ?");
                $stmt->execute(['172.25.29.18']);
            } elseif ($has_ip_address) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip_address != ?");
                $stmt->execute(['172.25.29.18']);
            }
            $delete_count = $stmt->rowCount();
        } elseif (strpos($db, 'minhaj') !== false || $label === 'minhaj') {
            // minhaj's DB -> Keep only minhaj's IPs
            $allowed_ips = ['172.25.31.86', '10.10.10.10', '172.16.16.2', '10.10.10.18'];
            $in_clause = implode(',', array_fill(0, count($allowed_ips), '?'));
            
            if ($has_ip && $has_ip_address) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip NOT IN ($in_clause) AND ip_address NOT IN ($in_clause)");
                $stmt->execute(array_merge($allowed_ips, $allowed_ips));
            } elseif ($has_ip) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip NOT IN ($in_clause)");
                $stmt->execute($allowed_ips);
            } elseif ($has_ip_address) {
                $stmt = $test_pdo->prepare("DELETE FROM olts WHERE ip_address NOT IN ($in_clause)");
                $stmt->execute($allowed_ips);
            }
            $delete_count = $stmt->rowCount();
        } else {
            // Other databases -> Delete any seeded OLTs (staff_id = 0)
            $stmt = $test_pdo->query("DELETE FROM olts WHERE staff_id = 0");
            $delete_count = $stmt->rowCount();
        }
        
        echo "Database: $db -> Leaked OLTs Deleted: $delete_count\n";
    } catch (Exception $e) {
        echo "Error cleaning $db: " . $e->getMessage() . "\n";
    }
}
?>
